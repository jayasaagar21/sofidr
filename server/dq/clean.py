"""Human-facing cleaning for mixed, imperfect tabular datasets.

Combines SOFIDR-aligned tactics (impute / standardize / defend retention) with
established data-cleaning practice: sentinel cleanup, synonym collapse
(countries, booleans), type normalization, and duplicate removal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .aliases import (
    BOOL_CANONICAL,
    STATUS_CANONICAL,
    canonicalize_country,
    looks_like_country_column,
    normalize_key,
)
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
    tactics: list[dict[str, str]] = field(default_factory=list)
    dataset_judgment: str = ""

    @property
    def steps(self) -> list[str]:
        return [entry.step for entry in self.repair_log] + self.semantic_steps


def _sample_strings(series: pd.Series, limit: int = 80) -> list[str]:
    values: list[str] = []
    for value in series.dropna().astype(str).head(400):
        text = value.strip()
        if text:
            values.append(text)
        if len(values) >= limit:
            break
    return values


def _title_safe(value: str) -> str:
    return value.strip().title() if value.strip() else value


def _standardize_semantics(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str], list[dict[str, str]]]:
    out = df.copy()
    steps: list[str] = []
    tactics: list[dict[str, str]] = []

    for column in out.columns:
        key = re.sub(r"[^a-z0-9]+", "_", str(column).lower()).strip("_")
        series = out[column]
        samples = _sample_strings(series)

        if any(token in key for token in ("date", "time", "timestamp")):
            parsed = pd.to_datetime(series, errors="coerce", format="mixed", dayfirst=True)
            non_missing = series.notna()
            if non_missing.any() and parsed[non_missing].notna().mean() >= 0.8:
                out[column] = parsed
                steps.append(f"standardized_{key}_dates")
                tactics.append(
                    {
                        "tactic": "Temporal normalization",
                        "column": str(column),
                        "why": "Date-like field → ISO-ready timestamps for consistent analysis.",
                    }
                )
            continue

        if "email" in key:
            values = series.astype("string").str.strip().str.lower()
            valid = values.str.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", na=False)
            invalid = series.notna() & ~valid
            out[column] = values.mask(invalid)
            if invalid.any():
                steps.append(f"validated_{key}")
                tactics.append(
                    {
                        "tactic": "Format validation",
                        "column": str(column),
                        "why": "Invalid emails cleared so they do not pollute unique counts.",
                    }
                )
            continue

        # Country / geo synonym collapse (name OR value evidence).
        if looks_like_country_column(str(column), samples):
            mapped = []
            changed = 0
            for value in series:
                if not isinstance(value, str) or not value.strip():
                    mapped.append(value)
                    continue
                canon = canonicalize_country(value)
                if canon:
                    if normalize_key(value) != normalize_key(canon):
                        changed += 1
                    mapped.append(canon)
                else:
                    mapped.append(_title_safe(value))
            out[column] = mapped
            steps.append(f"canonicalized_country_{key}")
            tactics.append(
                {
                    "tactic": "Geographic synonym collapse",
                    "column": str(column),
                    "why": (
                        f"Mapped aliases like US / USA / United States to one label"
                        f"{f' ({changed} cells changed)' if changed else ''}."
                    ),
                }
            )
            continue

        if key.endswith("name") or "_name" in key or key in {"first", "last", "full_name"}:
            out[column] = series.map(
                lambda value: value.strip().title() if isinstance(value, str) else value
            )
            steps.append(f"standardized_{key}")
            continue

        # Boolean-like columns
        if samples and sum(1 for s in samples if normalize_key(s) in BOOL_CANONICAL) / len(samples) >= 0.5:
            out[column] = series.map(
                lambda value: BOOL_CANONICAL.get(normalize_key(value), value)
                if isinstance(value, str)
                else value
            )
            steps.append(f"normalized_boolean_{key}")
            tactics.append(
                {
                    "tactic": "Boolean synonym collapse",
                    "column": str(column),
                    "why": "Y/N/true/false → Yes/No for consistent categories.",
                }
            )
            continue

        # Status / category title-case + status map
        if any(token in key for token in ("status", "state", "category", "type", "label", "class")):
            def _map_status(value):
                if not isinstance(value, str):
                    return value
                key_v = normalize_key(value)
                if key_v in STATUS_CANONICAL:
                    return STATUS_CANONICAL[key_v]
                return value.strip().title()

            out[column] = series.map(_map_status)
            steps.append(f"standardized_category_{key}")
            tactics.append(
                {
                    "tactic": "Categorical standardization",
                    "column": str(column),
                    "why": "Trim + title-case + common status synonyms for cleaner groupings.",
                }
            )
            continue

        # Generic object columns: strip whitespace; collapse country aliases if present
        if pd.api.types.is_object_dtype(series) or isinstance(series.dtype, pd.CategoricalDtype):
            def _generic(value):
                if not isinstance(value, str):
                    return value
                stripped = value.strip()
                canon = canonicalize_country(stripped)
                return canon if canon else stripped

            before_unique = series.dropna().astype(str).str.strip().nunique()
            out[column] = series.map(_generic)
            after_unique = pd.Series(out[column]).dropna().astype(str).nunique()
            if after_unique < before_unique:
                steps.append(f"collapsed_aliases_{key}")
                tactics.append(
                    {
                        "tactic": "Alias collapse",
                        "column": str(column),
                        "why": f"Reduced distinct labels {before_unique} → {after_unique} via synonym maps.",
                    }
                )

        if key == "age" or key.endswith("_age"):
            numeric = pd.to_numeric(out[column], errors="coerce")
            invalid = numeric.notna() & ~numeric.between(0, 120)
            out[column] = numeric.mask(invalid)
            if invalid.any() or numeric.isna().sum() > series.isna().sum():
                steps.append(f"bounded_{key}_0_120")
                tactics.append(
                    {
                        "tactic": "Domain bounds",
                        "column": str(column),
                        "why": "Ages outside 0–120 treated as missing.",
                    }
                )

        if any(token in key for token in ("price", "amount", "cost", "revenue", "salary", "fee")):
            raw = series.astype("string").str.replace(r"[$€£,\s]", "", regex=True)
            numeric = pd.to_numeric(raw, errors="coerce")
            invalid = numeric.notna() & (numeric < 0)
            out[column] = numeric.mask(invalid)
            steps.append(f"parsed_currency_{key}")
            tactics.append(
                {
                    "tactic": "Numeric / currency parse",
                    "column": str(column),
                    "why": "Strip currency symbols and reject negative amounts.",
                }
            )

    return out, list(dict.fromkeys(steps)), tactics


def _judge_dataset(before: Report, df: pd.DataFrame) -> str:
    missing = before.pct_missing if hasattr(before, "pct_missing") else 0
    # Report may expose completeness-like fields via n_cells — keep judgment plain.
    n_rows, n_cols = df.shape
    dup = before.n_duplicate_rows
    parts = [
        f"Tabular dataset with {n_rows:,} rows × {n_cols} columns.",
    ]
    if dup:
        parts.append(f"Detected {dup:,} exact duplicate rows — removal protects inflated KPIs.")
    parts.append(
        "Cleaning applies structural repair, synonym collapse (e.g. US/USA/United States), "
        "type normalization, and missing-value fills with trace indicators."
    )
    return " ".join(parts)


def clean_for_human(df: pd.DataFrame) -> CleanResult:
    """Repair structure, normalize common business fields, and fill missing cells."""
    before = profile(df)
    repaired, repair_log = structural_repair(df)
    repaired, semantic_steps, tactics = _standardize_semantics(repaired)
    duplicate_rows_removed = before.n_duplicate_rows
    missing_filled = 0

    tactics.insert(
        0,
        {
            "tactic": "Structural repair (SOFIDR defensive)",
            "column": "(all)",
            "why": "Sentinel nulls, trim, and shape fixes before semantic cleanup — retention-aware.",
        },
    )

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

    if missing_filled:
        tactics.append(
            {
                "tactic": "Imputation with indicators",
                "column": "(missing cells)",
                "why": "Median/mode fill plus __was_missing flags — phalanx-style completeness without hiding gaps.",
            }
        )

    for column in repaired.columns:
        if pd.api.types.is_datetime64_any_dtype(repaired[column]):
            repaired[column] = repaired[column].dt.strftime("%Y-%m-%d")

    after = profile(repaired)
    judgment = _judge_dataset(before, repaired)
    return CleanResult(
        dataframe=repaired,
        before=before,
        after=after,
        repair_log=repair_log,
        semantic_steps=semantic_steps,
        missing_filled=missing_filled,
        duplicate_rows_removed=duplicate_rows_removed,
        tactics=tactics,
        dataset_judgment=judgment,
    )
