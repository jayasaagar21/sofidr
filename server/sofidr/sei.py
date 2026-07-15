"""
Strategic Efficiency Index (SEI), measured without leakage.

    SEI = 0.40*Accuracy + 0.25*Stability + 0.20*Retention + 0.15*Simplicity

Faithful to the paper's weights and component definitions, but every component
is now estimated correctly:

* Accuracy / Stability come from cross_val_score on the *pipeline*, so all
  preprocessing refits per fold. The original prototype transformed the full
  dataset first and cross-validated afterward -> leakage.

* All formations are scored with the SAME StratifiedKFold splits on the SAME
  (X, y), so their scores are directly comparable. In the prototype each
  formation was scored on its own differently-shaped array, so the numbers were
  not comparable across formations.

* Retention is the fraction of rows that survive the formation's row-dropping
  steps (outlier removal reduces it; SMOTE is capped at 1.0). Estimated on the
  full data, which is a stable property of (formation, data).

* Simplicity penalizes change in feature-space dimensionality, computed
  analytically from the pipeline configuration.

Note on interpretation (documented, not hidden): with a scale-invariant base
model such as RandomForest, scaling is a no-op and 35% of SEI rewards leaving
data untouched, so minimal formations score very high. That is a real property
of this metric+model combination, not a bug. Swap `base_estimator` to
LogisticRegression to see the formations differentiate. See README.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold

from .formations import Formation, FORMATIONS

W_ACCURACY, W_STABILITY, W_RETENTION, W_SIMPLICITY = 0.40, 0.25, 0.20, 0.15
LAMBDA = 0.05  # simplicity penalty sensitivity


@dataclass
class SEIResult:
    formation: str
    sei: float
    accuracy: float
    stability: float
    retention: float
    simplicity: float
    n_after: int
    d_after: int
    error: str = ""

    def as_dict(self) -> dict:
        return {
            "formation": self.formation, "sei": round(self.sei, 4),
            "accuracy": round(self.accuracy, 4), "stability": round(self.stability, 4),
            "retention": round(self.retention, 4), "simplicity": round(self.simplicity, 4),
            "n_after": self.n_after, "d_after": self.d_after, "error": self.error,
        }


def _retention(formation: Formation, X: np.ndarray, y: np.ndarray) -> tuple[float, int]:
    """Fraction of rows surviving row-dropping steps, estimated on full data."""
    from .formations import _OUTLIER_FUNCS, _IMPUTERS

    if formation.outlier is None:
        return 1.0, len(y)
    Xi = _IMPUTERS[formation.impute]().fit_transform(X)
    _, y_kept = _OUTLIER_FUNCS[formation.outlier](Xi, np.asarray(y))
    n_after = len(y_kept)
    return min(1.0, n_after / len(y)), n_after


def _simplicity(formation: Formation, n_features: int) -> tuple[float, int]:
    d_after = formation.output_dim(n_features)
    return 1.0 / (1.0 + LAMBDA * abs(d_after - n_features)), d_after


def compute_sei(
    formation_name: str,
    X: np.ndarray,
    y: np.ndarray,
    cv: StratifiedKFold,
    base_estimator=None,
    minority_count: int = 2,
) -> SEIResult:
    formation = FORMATIONS[formation_name]
    X = np.asarray(X, dtype=float)
    y = np.asarray(y)
    n_features = X.shape[1]

    if base_estimator is None:
        base_estimator = RandomForestClassifier(n_estimators=50, random_state=42)

    retention, n_after = _retention(formation, X, y)
    simplicity, d_after = _simplicity(formation, n_features)

    try:
        pipe = formation.build_pipeline(n_features, minority_count)
        pipe.steps.append(("clf", clone(base_estimator)))
        scores = cross_val_score(pipe, X, y, cv=cv, scoring="accuracy")
        accuracy = float(np.mean(scores))
        stability = float(1.0 - np.std(scores))
    except Exception as exc:  # noqa: BLE001 -- record, don't crash the sweep
        return SEIResult(formation_name, 0.0, 0.0, 0.0, retention, simplicity,
                         n_after, d_after, error=f"{type(exc).__name__}: {exc}")

    sei = (W_ACCURACY * accuracy + W_STABILITY * stability
           + W_RETENTION * retention + W_SIMPLICITY * simplicity)

    return SEIResult(formation_name, sei, accuracy, stability, retention,
                     simplicity, n_after, d_after)
