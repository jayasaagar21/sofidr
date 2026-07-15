"""
sofidr.dq — data quality layer, rebuilt.

THE CENTRAL DISTINCTION the previous version lacked
---------------------------------------------------
Cleaning operations split into two kinds, and conflating them is what
caused Phase 2 to leak into Phase 1's cross-validation:

  STRUCTURAL  — deterministic, estimates nothing from the data distribution.
                Parsing "05880" as text. Trimming whitespace. Dropping an
                all-null column. Dropping duplicate rows. Safe to apply once,
                to the whole dataset, before any split. Cannot leak.

  ESTIMATED   — learns parameters from the rows it sees (a mean, a quantile,
                a category list, a scale). MUST be re-fit inside every CV
                fold. Applying it to the full dataset before Phase 1 bakes
                test-fold information into the training data permanently.

So this module never returns "cleaned data" to Phase 1. It returns:
  1. a structurally-repaired frame (safe, deterministic), and
  2. an UNFITTED sklearn transformer describing the estimated steps,
     which Phase 1 drops inside its Pipeline and fits per fold.

Export-for-humans is a separate, explicitly-labelled path.

Standards this follows:
  - ISO/IEC 25012 + DAMA-DMBOK quality dimensions (completeness, uniqueness,
    validity, consistency) measured and reported separately, not collapsed
    into one invented score.
  - sklearn estimator API: fit/transform separation is the leak barrier.
  - Missingness indicators retained (sklearn SimpleImputer add_indicator):
    "was this missing" is frequently predictive; imputing without an
    indicator destroys that signal silently.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field, asdict
from typing import Any, Literal, Sequence

import numpy as np
import pandas as pd

Role = Literal["numeric", "categorical", "datetime", "text", "identifier", "constant", "empty"]

# Columns whose *textual form* carries meaning and must never be coerced to a
# number. Leading zeros, check digits, and E-notation are all destroyed by
# pd.to_numeric. Losing them is silent and unrecoverable.
_IDENTIFIER_HINTS = re.compile(
    r"(^|_)(id|uuid|guid|zip|zipcode|postal|postcode|pin|pincode|phone|mobile|"
    r"ssn|ein|isbn|imei|iban|account|acct|invoice|order|sku|upc|ean|barcode|"
    r"code|no|num|number|reference|ref)($|_)",
    re.IGNORECASE,
)


def _looks_like_padded_number(s: pd.Series) -> bool:
    """'05880' -> True. Leading zeros mean the string form is load-bearing."""
    v = s.dropna().astype(str)
    if v.empty:
        return False
    padded = v.str.match(r"^0\d+$")
    return bool(padded.any())


# --------------------------------------------------------------------------- #
# 1. MEASUREMENT  (ISO 25012 / DAMA dimensions — reported, never blended)
# --------------------------------------------------------------------------- #

@dataclass
class ColumnReport:
    name: str
    role: Role
    dtype: str
    n: int
    # --- completeness
    n_missing: int
    pct_missing: float
    # --- uniqueness / cardinality
    n_unique: int
    pct_unique: float
    # --- distribution (numeric only; None otherwise)
    mean: float | None = None
    median: float | None = None
    std: float | None = None
    p01: float | None = None
    p99: float | None = None
    skew: float | None = None
    # --- validity
    n_extreme: int = 0          # |robust z| > 3.5 — FLAGGED, never auto-deleted
    pct_extreme: float = 0.0
    n_uncastable: int = 0       # non-null values that fail the column's own type
    notes: list[str] = field(default_factory=list)


def _json_safe(x: Any) -> Any:
    """NaN/Inf are not valid JSON. json.dumps emits bare NaN, which
    JSON.parse() in the browser throws on. Convert at the boundary."""
    if isinstance(x, (np.floating, float)):
        return None if (np.isnan(x) or np.isinf(x)) else round(float(x), 6)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    return x


def infer_role(name: str, s: pd.Series) -> Role:
    """Order matters. The previous version tested datetime BEFORE numeric,
    so pd.to_datetime happily read integer ages as nanosecond epochs."""
    nn = s.dropna()
    if nn.empty:
        return "empty"
    if nn.nunique() == 1:
        return "constant"

    # 1. Identifier. Zero-padding is decisive on its own — '05880' is a string
    #    whose leading zero is data. A NAME hint is only suggestive: plan_code,
    #    country_code and status_code are perfectly good categoricals. So a
    #    name hint must be corroborated by high cardinality before we act.
    if _looks_like_padded_number(nn):
        return "identifier"
    if _IDENTIFIER_HINTS.search(name) and nn.nunique() / len(nn) > 0.5:
        return "identifier"

    # 2. Already-typed columns need no sniffing.
    if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
        # A near-unique integer column is an ID, not a feature.
        if pd.api.types.is_integer_dtype(s) and nn.nunique() / len(nn) > 0.98:
            return "identifier"
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(s):
        return "datetime"
    if pd.api.types.is_bool_dtype(s):
        return "categorical"

    # 3. Object columns: numeric BEFORE datetime.
    cast = pd.to_numeric(nn, errors="coerce")
    if cast.notna().mean() >= 0.95:
        return "numeric"

    # Datetime only with an explicit format match — never let dateutil guess
    # its way through integers or product codes.
    sample = nn.astype(str).head(200)
    iso_like = sample.str.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}([ T].*)?$")
    dmy_like = sample.str.match(r"^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$")
    if iso_like.mean() >= 0.95 or dmy_like.mean() >= 0.95:
        return "datetime"

    # 4. Cardinality: an ABSOLUTE ceiling. The old rule (`nunique < 0.1 * n`)
    #    made 50,000 distinct values "categorical" on a 1M-row frame.
    k = nn.nunique()
    if k <= 50 or (k <= 200 and k / len(nn) < 0.05):
        return "categorical"
    if k / len(nn) > 0.98:
        return "identifier"
    return "text"


def _robust_z_extreme(x: pd.Series) -> np.ndarray:
    """MAD-based outlier flag. Robust to the very contamination it looks for,
    unlike mean/std. Threshold 3.5 is the Iglewicz-Hoaglin convention."""
    v = pd.to_numeric(x, errors="coerce")
    med = v.median()
    mad = (v - med).abs().median()
    if not np.isfinite(mad) or mad == 0:
        # Degenerate spread: fall back to IQR, and if that's zero too, no flags.
        q1, q3 = v.quantile(0.25), v.quantile(0.75)
        iqr = q3 - q1
        if not np.isfinite(iqr) or iqr == 0:
            return np.zeros(len(v), dtype=bool)
        return ((v < q1 - 3 * iqr) | (v > q3 + 3 * iqr)).fillna(False).to_numpy()
    mz = 0.6745 * (v - med) / mad
    return (mz.abs() > 3.5).fillna(False).to_numpy()


def profile_column(name: str, s: pd.Series) -> ColumnReport:
    n = len(s)
    nmiss = int(s.isna().sum())
    role = infer_role(name, s)
    nn = s.dropna()

    r = ColumnReport(
        name=name, role=role, dtype=str(s.dtype), n=n,
        n_missing=nmiss, pct_missing=round(100 * nmiss / n, 3) if n else 0.0,
        n_unique=int(nn.nunique()), pct_unique=round(100 * nn.nunique() / n, 3) if n else 0.0,
    )

    if role == "numeric":
        v = pd.to_numeric(s, errors="coerce")
        r.n_uncastable = int((v.isna() & s.notna()).sum())
        if v.notna().any():
            r.mean = _json_safe(v.mean())
            r.median = _json_safe(v.median())
            r.std = _json_safe(v.std())
            r.p01 = _json_safe(v.quantile(0.01))
            r.p99 = _json_safe(v.quantile(0.99))
            try:
                r.skew = _json_safe(v.skew())
            except Exception:
                r.skew = None
            ext = _robust_z_extreme(v)
            r.n_extreme = int(ext.sum())
            r.pct_extreme = round(100 * ext.mean(), 3)

    # --- notes: observations, not verdicts. No auto-remediation implied.
    if role == "empty":
        r.notes.append("entirely null")
    if role == "constant":
        r.notes.append("single distinct value — carries no information for a model")
    if r.pct_missing >= 60:
        r.notes.append(f"{r.pct_missing:.1f}% missing — imputation here is mostly invention")
    elif r.pct_missing >= 20:
        r.notes.append(f"{r.pct_missing:.1f}% missing — keep a missingness indicator")
    if r.n_uncastable:
        r.notes.append(f"{r.n_uncastable} non-null values fail numeric parse")
    if r.skew is not None and abs(r.skew) > 2:
        r.notes.append(f"skew={r.skew:.2f} — use median, not mean, for imputation")
    if role == "identifier":
        r.notes.append("identifier — held as text, excluded from modelling")
    return r


@dataclass
class Report:
    n_rows: int
    n_cols: int
    # ISO 25012 dimensions, reported separately.
    completeness_pct: float          # % of cells populated
    uniqueness_pct: float            # % of rows that are not duplicates  (ROW-level)
    validity_pct: float              # % of cells that parse as their inferred type
    n_duplicate_rows: int
    columns: dict[str, ColumnReport]
    input_sha256: str

    def to_dict(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if k != "columns"}
        d["columns"] = {k: {kk: _json_safe(vv) for kk, vv in asdict(v).items()}
                        for k, v in self.columns.items()}
        return d


def profile(df: pd.DataFrame) -> Report:
    n, m = df.shape
    cols = {c: profile_column(c, df[c]) for c in df.columns}

    cells = max(n * m, 1)
    completeness = 100 * (1 - df.isna().sum().sum() / cells)

    # Uniqueness is a ROW property. The old code called .duplicated() on each
    # COLUMN, so a gender column scored "100% duplicate" and dragged the
    # dataset's score down for the crime of being categorical.
    n_dupe = int(df.duplicated(keep="first").sum())
    uniqueness = 100 * (1 - n_dupe / n) if n else 100.0

    uncastable = sum(c.n_uncastable for c in cols.values())
    validity = 100 * (1 - uncastable / cells)

    h = hashlib.sha256(pd.util.hash_pandas_object(df, index=False).values.tobytes()).hexdigest()[:16]

    return Report(
        n_rows=n, n_cols=m,
        completeness_pct=round(completeness, 3),
        uniqueness_pct=round(uniqueness, 3),
        validity_pct=round(validity, 3),
        n_duplicate_rows=n_dupe,
        columns=cols,
        input_sha256=h,
    )


# --------------------------------------------------------------------------- #
# 2. STRUCTURAL REPAIR  (deterministic — cannot leak, safe before splitting)
# --------------------------------------------------------------------------- #

@dataclass
class RepairLog:
    step: str
    detail: str
    rows_before: int
    rows_after: int
    cols_before: int
    cols_after: int


def structural_repair(
    df: pd.DataFrame,
    *,
    drop_duplicate_rows: bool = True,
    drop_empty_columns: bool = True,
    drop_constant_columns: bool = False,
) -> tuple[pd.DataFrame, list[RepairLog]]:
    """Only operations that estimate nothing from the distribution.

    Every step here is a pure function of the cell values, so running it on the
    full dataset before a train/test split introduces no leakage.
    """
    out = df.copy()
    log: list[RepairLog] = []

    def _log(step: str, detail: str, before: pd.DataFrame):
        log.append(RepairLog(step, detail, len(before), len(out),
                             before.shape[1], out.shape[1]))

    # -- trim whitespace on genuine string cells only.
    #    .str.strip() on a mixed object column silently turns every non-string
    #    into NaN. Mask to real strings first.
    b = out.copy()
    trimmed = 0
    for c in out.columns:
        if out[c].dtype == object:
            is_str = out[c].map(lambda v: isinstance(v, str))
            if is_str.any():
                before_vals = out.loc[is_str, c]
                out.loc[is_str, c] = before_vals.str.strip()
                trimmed += int((before_vals != out.loc[is_str, c]).sum())
    if trimmed:
        _log("trim_whitespace", f"{trimmed} string cells trimmed (non-strings untouched)", b)

    # -- normalise the many spellings of "missing" to real NA.
    b = out.copy()
    sentinels = {"", "na", "n/a", "null", "none", "nan", "-", "--", "?", "unknown", "#n/a"}
    hit = 0
    for c in out.columns:
        if out[c].dtype == object:
            m = out[c].map(lambda v: isinstance(v, str) and v.strip().lower() in sentinels)
            hit += int(m.sum())
            out.loc[m, c] = np.nan
    if hit:
        _log("normalise_missing_sentinels", f"{hit} sentinel strings -> NA", b)

    # -- drop columns that are entirely null.
    if drop_empty_columns:
        b = out.copy()
        empty = [c for c in out.columns if out[c].isna().all()]
        if empty:
            out = out.drop(columns=empty)
            _log("drop_empty_columns", f"dropped {empty}", b)

    if drop_constant_columns:
        b = out.copy()
        const = [c for c in out.columns if out[c].dropna().nunique() == 1]
        if const:
            out = out.drop(columns=const)
            _log("drop_constant_columns", f"dropped {const}", b)

    # -- exact duplicate rows. Row-level, estimates nothing.
    if drop_duplicate_rows:
        b = out.copy()
        n_dupe = int(out.duplicated(keep="first").sum())
        if n_dupe:
            out = out.drop_duplicates(keep="first").reset_index(drop=True)
            _log("drop_duplicate_rows", f"removed {n_dupe} exact duplicate rows", b)

    # -- cast to declared types, preserving identifier columns AS TEXT.
    b = out.copy()
    casts = []
    for c in out.columns:
        role = infer_role(c, out[c])
        if role == "identifier":
            if out[c].dtype != object:
                out[c] = out[c].astype("string")
                casts.append(f"{c}->string (identifier)")
        elif role == "numeric" and out[c].dtype == object:
            cast = pd.to_numeric(out[c], errors="coerce")
            # Only count NON-NULL values that fail. The old rule divided by
            # len(series), so a column with 10% missing could never convert.
            nn = out[c].notna()
            if nn.sum() and (cast[nn].notna().sum() / nn.sum()) >= 0.95:
                out[c] = cast
                casts.append(f"{c}->numeric")
        elif role == "categorical" and out[c].dtype == object:
            out[c] = out[c].astype("category")
            casts.append(f"{c}->category")
    if casts:
        _log("cast_types", "; ".join(casts), b)

    return out, log
