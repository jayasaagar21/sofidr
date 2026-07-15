"""Human-facing cleaning for mixed, imperfect tabular datasets."""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .core import Report, RepairLog, infer_role, profile, structural_repair


@dataclass
class CleanResult:
    dataframe: pd.DataFrame
    before: Report
    after: Report
    repair_log: list[RepairLog]
    semantic_steps: list[str]
    missing_filled: int
    duplicate_rows_removed: int

    @property
    def steps(self) -> list[str]:
        return [entry.step for entry in self.repair_log] + self.semantic_steps


_COUNTRY_ALIASES = {
    "us": "United States",
    "u.s.": "United States",
    "usa": "United States",
    "united states": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "united kingdom": "United Kingdom",
}


def _standardize_semantics(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    out = df.copy()
    steps: list[str] = []

    for column in out.columns:
        key = re.sub(r"[^a-z0-9]+", "_", str(column).lower()).strip("_")
        series = out[column]

        if any(token in key for token in ("date", "time", "timestamp")):
            parsed = pd.to_datetime(series, errors="coerce", format="mixed", dayfirst=True)
            non_missing = series.notna()
            if non_missing.any() and parsed[non_missing].notna().mean() >= 0.8:
                out[column] = parsed
                steps.append(f"standardized_{key}")
        elif "email" in key:
            values = series.astype("string").str.strip().str.lower()
            valid = values.str.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", na=False)
            invalid = series.notna() & ~valid
            out[column] = values.mask(invalid)
            if invalid.any():
                steps.append(f"validated_{key}")
        elif key.endswith("name") or "_name" in key:
            out[column] = series.map(
                lambda value: value.title() if isinstance(value, str) else value
            )
            steps.append(f"standardized_{key}")
        elif "country" in key:
            out[column] = series.map(
                lambda value: _COUNTRY_ALIASES.get(value.strip().lower(), value.strip().title())
                if isinstance(value, str)
                else value
            )
            steps.append(f"standardized_{key}")
        elif "category" in key and (
            pd.api.types.is_object_dtype(series)
            or isinstance(series.dtype, pd.CategoricalDtype)
        ):
            out[column] = series.astype("string").str.strip().str.title()
            steps.append(f"standardized_{key}")

        if key == "age" or key.endswith("_age"):
            numeric = pd.to_numeric(out[column], errors="coerce")
            invalid = numeric.notna() & ~numeric.between(0, 120)
            out[column] = numeric.mask(invalid)
            if invalid.any() or numeric.isna().sum() > series.isna().sum():
                steps.append(f"bounded_{key}_0_120")

        if any(token in key for token in ("price", "amount_paid", "cost")):
            numeric = pd.to_numeric(out[column], errors="coerce")
            invalid = numeric.notna() & (numeric < 0)
            if invalid.any():
                out.loc[invalid, column] = np.nan
                steps.append(f"removed_negative_{key}")

    return out, list(dict.fromkeys(steps))


def clean_for_human(df: pd.DataFrame) -> CleanResult:
    """Repair structure, normalize common business fields, and fill missing cells."""
    before = profile(df)
    repaired, repair_log = structural_repair(df)
    repaired, semantic_steps = _standardize_semantics(repaired)
    duplicate_rows_removed = before.n_duplicate_rows
    missing_filled = 0

    for column in list(repaired.columns):
        missing = repaired[column].isna()
        if not missing.any():
            continue
        role = infer_role(column, repaired[column])
        indicator = f"{column}__was_missing"
        if indicator not in repaired.columns:
            repaired[indicator] = missing.astype(int)

        if role == "numeric":
            fill = pd.to_numeric(repaired[column], errors="coerce").median()
            if not np.isfinite(fill):
                fill = 0
        elif role == "datetime":
            mode = repaired[column].mode()
            fill = mode.iloc[0] if len(mode) else pd.NaT
        else:
            mode = repaired[column].mode()
            fill = mode.iloc[0] if len(mode) else "Unknown"
        repaired[column] = repaired[column].fillna(fill)
        missing_filled += int(missing.sum())

    # ISO dates are portable across CSV readers and spreadsheet software.
    for column in repaired.columns:
        if pd.api.types.is_datetime64_any_dtype(repaired[column]):
            repaired[column] = repaired[column].dt.strftime("%Y-%m-%d")

    after = profile(repaired)
    return CleanResult(
        dataframe=repaired,
        before=before,
        after=after,
        repair_log=repair_log,
        semantic_steps=semantic_steps,
        missing_filled=missing_filled,
        duplicate_rows_removed=duplicate_rows_removed,
    )
