"""Paper Section 5.2 conventional baselines, scored with the same SEI machinery.

These are fixed preprocessing baselines, not competing strategies. SOFIDR remains
the single authoritative strategy; baselines exist only for fair comparison.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.decomposition import PCA
from sklearn.impute import SimpleImputer
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.base import clone

from .sei import (
    LAMBDA,
    W_ACCURACY,
    W_RETENTION,
    W_SIMPLICITY,
    W_STABILITY,
)


@dataclass(frozen=True)
class BaselineSpec:
    name: str
    label: str
    description: str


# Exact baseline set from SOFIDR paper §5.2.
BASELINES: tuple[BaselineSpec, ...] = (
    BaselineSpec("none", "None", "Imputation of missing values only."),
    BaselineSpec("standard", "Standard", "Standard scaling only after imputation."),
    BaselineSpec("pca", "PCA", "Scaling followed by PCA with 5 components."),
    BaselineSpec(
        "full",
        "Full",
        "Aggressive pipeline: imputation, standard scaling, SelectKBest(k=10), and PCA(5).",
    ),
)


def _build_baseline(name: str, n_features: int) -> Pipeline:
    steps: list[tuple[str, object]] = [("impute", SimpleImputer(strategy="mean"))]
    if name == "none":
        return Pipeline(steps)
    if name == "standard":
        steps.append(("scale", StandardScaler()))
        return Pipeline(steps)
    if name == "pca":
        steps.extend(
            [
                ("scale", StandardScaler()),
                ("pca", PCA(n_components=min(5, n_features), random_state=42)),
            ]
        )
        return Pipeline(steps)
    if name == "full":
        from sklearn.feature_selection import SelectKBest, mutual_info_classif

        k = min(10, n_features)
        steps.extend(
            [
                ("scale", StandardScaler()),
                ("select", SelectKBest(mutual_info_classif, k=k)),
                ("pca", PCA(n_components=min(5, k), random_state=42)),
            ]
        )
        return Pipeline(steps)
    raise ValueError(f"Unknown baseline: {name}")


def _output_dim(name: str, n_features: int) -> int:
    if name in {"none", "standard"}:
        return n_features
    if name == "pca":
        return min(5, n_features)
    if name == "full":
        return min(5, min(10, n_features))
    raise ValueError(f"Unknown baseline: {name}")


def evaluate_baselines(
    X: np.ndarray,
    y: np.ndarray,
    *,
    base_estimator,
    cv_folds: int = 3,
    random_state: int = 42,
) -> list[dict]:
    """Score paper baselines with the same SEI weights and shared CV folds."""
    from sklearn.model_selection import cross_val_score

    X = np.asarray(X, dtype=float)
    y = np.asarray(y)
    n_features = X.shape[1]
    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=random_state)
    board: list[dict] = []

    for spec in BASELINES:
        retention = 1.0
        d_after = _output_dim(spec.name, n_features)
        simplicity = 1.0 / (1.0 + LAMBDA * abs(d_after - n_features))
        try:
            pipe = _build_baseline(spec.name, n_features)
            pipe.steps.append(("clf", clone(base_estimator)))
            scores = cross_val_score(pipe, X, y, cv=cv, scoring="accuracy")
            accuracy = float(np.mean(scores))
            stability = float(1.0 - np.std(scores))
            error = ""
        except Exception as exc:  # noqa: BLE001 -- keep the board complete
            accuracy = stability = 0.0
            error = f"{type(exc).__name__}: {exc}"

        sei = (
            W_ACCURACY * accuracy
            + W_STABILITY * stability
            + W_RETENTION * retention
            + W_SIMPLICITY * simplicity
        )
        board.append(
            {
                "name": spec.name,
                "label": spec.label,
                "description": spec.description,
                "sei": round(sei, 4),
                "accuracy": round(accuracy, 4),
                "stability": round(stability, 4),
                "retention": round(retention, 3),
                "simplicity": round(simplicity, 3),
                "error": error,
                "source": "SOFIDR paper Section 5.2",
            }
        )

    return sorted(board, key=lambda item: item["sei"], reverse=True)
