"""
sofidr.dq.plan — the estimated half of cleaning, as an UNFITTED transformer.

Why this exists
---------------
Phase 1's one real correctness achievement was passing a Pipeline into
cross_val_score, so preprocessing is re-fit on each training fold. If Phase 2
hands Phase 1 an already-imputed, already-scaled matrix, that achievement is
void: the imputation means were computed with the test folds in the room, and
no amount of care downstream can un-ring that bell.

So Phase 2 emits a *plan*, not a matrix. Phase 1 does:

    pipe = Pipeline([("clean", plan.to_transformer()), ("model", clf)])
    cross_val_score(pipe, X, y, cv=cv)          # fit per fold. No leak.

The human-facing "download my cleaned CSV" path is a DIFFERENT product and is
served by fit_transform on everything — which is correct for a human opening
the file in Excel, and wrong for anything that will be cross-validated. The
two are kept apart deliberately and labelled.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, RobustScaler, StandardScaler

from .core import Report

NumImpute = Literal["median", "mean", "constant", "none"]
CatImpute = Literal["most_frequent", "constant", "none"]
Scale = Literal["standard", "robust", "none"]


@dataclass
class ColumnDecision:
    name: str
    action: Literal["numeric", "categorical", "drop"]
    reason: str
    impute: str = "none"
    add_indicator: bool = False
    winsorize: tuple[float, float] | None = None


@dataclass
class CleaningPlan:
    """Decisions only. Holds no fitted state, so it is safe to serialise,
    diff, review, and version-control."""
    decisions: list[ColumnDecision]
    scale: Scale = "robust"
    random_state: int = 0
    notes: list[str] = field(default_factory=list)

    # ---- introspection ---------------------------------------------------
    @property
    def numeric(self) -> list[str]:
        return [d.name for d in self.decisions if d.action == "numeric"]

    @property
    def categorical(self) -> list[str]:
        return [d.name for d in self.decisions if d.action == "categorical"]

    @property
    def dropped(self) -> list[str]:
        return [d.name for d in self.decisions if d.action == "drop"]

    def to_dict(self) -> dict:
        return {
            "scale": self.scale,
            "random_state": self.random_state,
            "notes": self.notes,
            "decisions": [asdict(d) for d in self.decisions],
        }

    def explain(self) -> str:
        w = max((len(d.name) for d in self.decisions), default=4)
        lines = [f"{'column'.ljust(w)}  {'action':<12} reason"]
        lines.append("-" * (w + 60))
        for d in self.decisions:
            extra = f" [impute={d.impute}{'+flag' if d.add_indicator else ''}]" if d.impute != "none" else ""
            lines.append(f"{d.name.ljust(w)}  {d.action:<12} {d.reason}{extra}")
        lines.append(f"\nscale={self.scale}  random_state={self.random_state}")
        for n in self.notes:
            lines.append(f"NOTE: {n}")
        return "\n".join(lines)

    # ---- the leak barrier ------------------------------------------------
    def to_transformer(self) -> ColumnTransformer:
        """UNFITTED. Hand this to Phase 1; it fits inside each CV fold."""
        num, cat = self.numeric, self.categorical
        blocks = []

        if num:
            steps = []
            imp = next((d for d in self.decisions if d.name in num and d.impute != "none"), None)
            strategy = imp.impute if imp else "median"
            add_ind = any(d.add_indicator for d in self.decisions if d.name in num)
            steps.append(("impute", SimpleImputer(strategy=strategy, add_indicator=add_ind)))
            if self.scale == "standard":
                steps.append(("scale", StandardScaler()))
            elif self.scale == "robust":
                # Robust to the extreme values we deliberately did NOT delete.
                steps.append(("scale", RobustScaler(quantile_range=(25.0, 75.0))))
            blocks.append(("num", Pipeline(steps), num))

        if cat:
            blocks.append(("cat", Pipeline([
                ("impute", SimpleImputer(strategy="most_frequent")),
                # handle_unknown='ignore' matters: a category present only in a
                # test fold must not explode at transform time.
                ("ohe", OneHotEncoder(handle_unknown="ignore",
                                      min_frequency=0.01,
                                      sparse_output=False)),
            ]), cat))

        return ColumnTransformer(blocks, remainder="drop", verbose_feature_names_out=False)


def build_plan(df: pd.DataFrame, report: Report, *, target: str | None = None,
               scale: Scale = "robust", random_state: int = 0) -> CleaningPlan:
    """Derive decisions from measurement. Every decision carries its reason."""
    decisions: list[ColumnDecision] = []
    notes: list[str] = []

    for name, c in report.columns.items():
        if name == target:
            continue

        if c.role in ("empty", "constant"):
            decisions.append(ColumnDecision(name, "drop", f"{c.role} — no information"))
            continue
        if c.role == "identifier":
            decisions.append(ColumnDecision(name, "drop", "identifier — not a feature"))
            continue
        if c.role == "text":
            decisions.append(ColumnDecision(
                name, "drop", f"free text, {c.n_unique} distinct — needs an encoder we don't have"))
            continue
        if c.role == "datetime":
            decisions.append(ColumnDecision(
                name, "drop", "datetime — derive features explicitly, don't ordinal-encode"))
            continue

        if c.pct_missing >= 60:
            decisions.append(ColumnDecision(
                name, "drop", f"{c.pct_missing:.0f}% missing — imputing would fabricate the column"))
            continue

        if c.role == "numeric":
            # Median for skewed, mean only when roughly symmetric. The old code
            # used mean unconditionally, which drags imputed values toward the
            # tail on any revenue-like column.
            strat = "median" if (c.skew is None or abs(c.skew) > 0.5) else "mean"
            reason = f"numeric ({'skewed' if strat == 'median' else 'symmetric'})"
            add_ind = c.pct_missing >= 5
            if add_ind:
                reason += f", {c.pct_missing:.0f}% missing"
            decisions.append(ColumnDecision(
                name, "numeric", reason, impute=strat, add_indicator=add_ind))
            if c.pct_extreme > 0:
                notes.append(
                    f"{name}: {c.n_extreme} extreme values ({c.pct_extreme:.1f}%) flagged, "
                    f"NOT removed — RobustScaler handles them without deleting rows")
        else:
            decisions.append(ColumnDecision(
                name, "categorical", f"categorical, {c.n_unique} levels", impute="most_frequent"))

    if report.n_duplicate_rows:
        notes.append(f"{report.n_duplicate_rows} duplicate rows removed in structural repair")

    return CleaningPlan(decisions=decisions, scale=scale, random_state=random_state, notes=notes)


# --------------------------------------------------------------------------- #
# Human export path — explicitly separate, explicitly labelled
# --------------------------------------------------------------------------- #

def export_for_human(df: pd.DataFrame, plan: CleaningPlan) -> tuple[pd.DataFrame, str]:
    """Produce a readable cleaned CSV: imputed, deduped, typed, but NOT scaled
    and NOT one-hot encoded — a person opening this in Excel wants their own
    columns back, not 47 dummy variables of float64.

    Returns (frame, warning). The warning is not decorative: this frame is fit
    on 100% of the rows and must never be fed to cross-validation.
    """
    out = df.copy()
    keep = plan.numeric + plan.categorical
    keep = [c for c in keep if c in out.columns]

    for d in plan.decisions:
        if d.name not in out.columns or d.action == "drop":
            continue
        s = out[d.name]
        if not s.isna().any():
            continue
        if d.action == "numeric":
            fill = s.median() if d.impute == "median" else s.mean()
        else:
            mode = s.mode()
            fill = mode.iloc[0] if len(mode) else "unknown"
        if d.add_indicator:
            out[f"{d.name}__was_missing"] = s.isna().astype(int)
        out[d.name] = s.fillna(fill)

    warn = (
        "Imputation values here were computed from ALL rows in this file. "
        "That is correct for inspection and reporting. It is NOT valid input to "
        "cross-validation or model selection — for that, pass the CleaningPlan "
        "to Phase 1 and let it fit per fold."
    )
    return out, warn
