"""
Battle formations as real, leak-free scikit-learn / imbalanced-learn pipelines.

Key correctness decisions vs. the original prototype:

1. Every formation is an imblearn Pipeline. When this pipeline is handed to
   cross_val_score, ALL fitted steps (imputation, scaling, feature selection,
   PCA) refit on each training fold only. The original prototype fit the whole
   pipeline on the full dataset and *then* cross-validated, leaking test-fold
   information (most severely through supervised SelectKBest).

2. Outlier removal and SMOTE are implemented as imblearn *samplers*
   (FunctionSampler / SMOTE). Samplers run during `fit` only and never touch
   the held-out fold, which is exactly the semantics row-dropping needs. This
   also means y is resampled consistently with X -- something a plain sklearn
   transformer cannot do.

3. Scaling is applied *before* PCA (PCA is scale-sensitive). The prototype
   scaled after PCA, which is unusual; we reorder for correctness.

4. SMOTE is actually wired in (the prototype declared `sample: 'smote'` for the
   guerrilla formation but never read the key and never imported imblearn, so
   guerrilla was identical to reconnaissance up to floating-point noise).

Formation provenance:
- The six core formations (phalanx, skirmisher, heavy_cavalry, guerrilla,
  scorched_earth, reconnaissance) match the SOFIDR paper, Table 1.
- `siege` and `diplomat` are two extra formations defined only in the assistant
  system prompt (not the paper or the original code). They are implemented here
  and clearly flagged so the toolset and the engine agree.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.experimental import enable_iterative_imputer  # noqa: F401
from sklearn.impute import SimpleImputer, KNNImputer, IterativeImputer
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler
from sklearn.feature_selection import (
    SelectKBest,
    VarianceThreshold,
    mutual_info_classif,
)
from sklearn.decomposition import PCA
from imblearn.pipeline import Pipeline as ImbPipeline
from imblearn.over_sampling import SMOTE
from imblearn import FunctionSampler


# --------------------------------------------------------------------------- #
# Row-dropping samplers (train-fold only via imblearn semantics)
# --------------------------------------------------------------------------- #
def _safe_keep_mask(y, mask, min_frac=0.5):
    """Apply a keep-mask, but refuse to drop too much or eliminate a class."""
    if mask.sum() < max(10, int(min_frac * len(y))):
        return np.ones(len(y), dtype=bool)
    kept_classes = np.unique(y[mask])
    if len(kept_classes) < len(np.unique(y)):
        return np.ones(len(y), dtype=bool)
    return mask


def _outlier_keep_mask(X, y, method):
    if method == "iqr":
        q1, q3 = np.percentile(X, 25, axis=0), np.percentile(X, 75, axis=0)
        iqr = q3 - q1
        mask = ~((X < (q1 - 1.5 * iqr)) | (X > (q3 + 1.5 * iqr))).any(axis=1)
    else:
        std = X.std(axis=0)
        std[std == 0] = 1.0
        z = np.abs((X - X.mean(axis=0)) / std)
        mask = (z < 3).all(axis=1)
    return _safe_keep_mask(y, mask)


def iqr_filter(X, y):
    mask = _outlier_keep_mask(X, y, "iqr")
    return X[mask], y[mask]


def zscore_filter(X, y):
    mask = _outlier_keep_mask(X, y, "zscore")
    return X[mask], y[mask]


_OUTLIER_FUNCS = {"iqr": iqr_filter, "zscore": zscore_filter}

_IMPUTERS = {
    "mean": lambda: SimpleImputer(strategy="mean"),
    "median": lambda: SimpleImputer(strategy="median"),
    "most_frequent": lambda: SimpleImputer(strategy="most_frequent"),
    "knn": lambda: KNNImputer(n_neighbors=5),
    "iterative": lambda: IterativeImputer(max_iter=10, random_state=42),
}

_SCALERS = {
    "standard": StandardScaler,
    "minmax": MinMaxScaler,
    "robust": RobustScaler,
}


def _mutual_info(X, y):
    return mutual_info_classif(X, y, random_state=42)


@dataclass
class EnhancementResult:
    dataframe: pd.DataFrame
    input_rows: int
    input_columns: int
    output_rows: int
    output_columns: int
    synthetic_rows: int
    removed_rows: int
    steps: list[str]


@dataclass(frozen=True)
class Formation:
    name: str
    impute: str
    scale: Optional[str]          # 'standard' | 'minmax' | 'robust' | None
    outlier: Optional[str]        # 'iqr' | 'zscore' | None
    feature_select: bool
    decompose: bool               # PCA
    sample: Optional[str]         # 'smote' | None
    variance_filter: bool = False
    target_terrain: str = ""
    paper: bool = True            # part of the published 6 formations?
    icon: str = ""

    # ----- analytic output dimensionality (for the SEI simplicity term) ----- #
    def output_dim(self, n_features: int) -> int:
        d = n_features
        if self.variance_filter:
            pass  # variance filter may drop columns at fit time; treat as <= d
        if self.feature_select and d > 10:
            d = min(10, d)
        if self.decompose and d > 5:
            d = min(5, d)
        return d

    def build_steps(self, n_features: int, minority_count: int):
        steps = [("impute", _IMPUTERS[self.impute]())]

        if self.variance_filter:
            steps.append(("variance", VarianceThreshold(threshold=0.0)))

        if self.outlier:
            steps.append(
                ("outliers", FunctionSampler(func=_OUTLIER_FUNCS[self.outlier], validate=False))
            )

        if self.sample == "smote":
            # k_neighbors must be < minority samples available in a train fold.
            k = max(1, min(5, minority_count - 1))
            steps.append(("smote", SMOTE(random_state=42, k_neighbors=k)))

        if self.scale:
            steps.append(("scale", _SCALERS[self.scale]()))

        if self.feature_select and n_features > 10:
            steps.append(
                ("select", SelectKBest(_mutual_info, k=min(10, n_features)))
            )

        if self.decompose and self.output_dim(n_features) > 0:
            n_comp = min(5, n_features)
            if self.feature_select and n_features > 10:
                n_comp = min(5, 10)
            steps.append(("pca", PCA(n_components=n_comp, random_state=42)))

        return steps

    # ----- build a fresh, unfitted leak-free pipeline ----------------------- #
    def build_pipeline(self, n_features: int, minority_count: int):
        return ImbPipeline(self.build_steps(n_features, minority_count))


def enhance_dataset(
    formation_name: str,
    X,
    y,
    feature_names,
    target_name: str,
) -> EnhancementResult:
    """Fit and apply a formation's preprocessing steps without a classifier."""
    if formation_name not in FORMATIONS:
        raise ValueError(f"Unknown formation: {formation_name}")

    X = np.asarray(X, dtype=float)
    y = np.asarray(y)
    names = np.asarray(list(feature_names), dtype=object)
    if X.ndim != 2 or X.shape[1] != len(names) or len(X) != len(y):
        raise ValueError("X, y, and feature_names have incompatible dimensions")
    if target_name == "_sofidr_row_origin" or "_sofidr_row_origin" in names:
        raise ValueError("_sofidr_row_origin is reserved for export provenance")

    input_rows = len(y)
    formation = FORMATIONS[formation_name]
    counts = pd.Series(y).value_counts()
    minority_count = int(counts.min())
    steps = formation.build_steps(X.shape[1], minority_count)
    origins = np.full(input_rows, "original", dtype=object)
    removed_rows = 0
    synthetic_rows = 0

    for step_name, step in steps:
        if step_name == "outliers":
            keep = _outlier_keep_mask(X, y, formation.outlier)
            removed_rows += int((~keep).sum())
            X, y, origins = X[keep], y[keep], origins[keep]
        elif step_name == "smote":
            original_count = len(y)
            X, y = step.fit_resample(X, y)
            synthetic_rows = len(y) - original_count
            # imbalanced-learn's SMOTE returns input rows first, followed by
            # generated rows; tests lock this provenance assumption in place.
            origins = np.concatenate(
                [origins, np.full(synthetic_rows, "synthetic", dtype=object)]
            )
        else:
            X = step.fit_transform(X, y)
            if step_name == "pca":
                names = np.asarray(
                    [f"pc_{index}" for index in range(1, X.shape[1] + 1)],
                    dtype=object,
                )
            elif hasattr(step, "get_feature_names_out"):
                names = np.asarray(step.get_feature_names_out(names), dtype=object)
            elif X.shape[1] != len(names):
                names = np.asarray(
                    [f"feature_{index}" for index in range(1, X.shape[1] + 1)],
                    dtype=object,
                )

    frame = pd.DataFrame(X, columns=names)
    frame[target_name] = y
    frame["_sofidr_row_origin"] = origins
    return EnhancementResult(
        dataframe=frame,
        input_rows=input_rows,
        input_columns=len(feature_names) + 1,
        output_rows=len(frame),
        output_columns=frame.shape[1],
        synthetic_rows=synthetic_rows,
        removed_rows=removed_rows,
        steps=[name for name, _ in steps],
    )


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #
FORMATIONS: dict[str, Formation] = {
    "phalanx": Formation(
        "phalanx", "median", "standard", "iqr", False, False, None,
        target_terrain="General-purpose, moderate missingness", icon="🛡️"),
    "skirmisher": Formation(
        "skirmisher", "mean", "standard", None, True, False, None,
        target_terrain="High-dimensional data (d/n > 0.1)", icon="🏹"),
    "heavy_cavalry": Formation(
        "heavy_cavalry", "median", "robust", "zscore", False, True, None,
        target_terrain="Highly correlated features", icon="⚔️"),
    "guerrilla": Formation(
        "guerrilla", "most_frequent", "standard", None, False, False, "smote",
        target_terrain="Imbalanced classes (balance < 0.5)", icon="🌿"),
    "scorched_earth": Formation(
        "scorched_earth", "median", "robust", "iqr", True, True, None,
        target_terrain="Maximum/aggressive preprocessing", icon="🔥"),
    "reconnaissance": Formation(
        "reconnaissance", "mean", None, None, False, False, None,
        target_terrain="Clean data, minimal intervention", icon="🔭"),
    # ---- extras defined only in the system prompt (not the paper) ---- #
    "siege": Formation(
        "siege", "knn", "minmax", None, False, False, None,
        variance_filter=True,
        target_terrain="Complex missing patterns, structured data",
        paper=False, icon="🏰"),
    "diplomat": Formation(
        "diplomat", "iterative", "standard", None, False, False, None,
        target_terrain="Features with complex interdependencies",
        paper=False, icon="🕊️"),
}


def get_all(include_extras: bool = True) -> list[str]:
    return [n for n, f in FORMATIONS.items() if include_extras or f.paper]


def describe(name: str) -> Formation:
    return FORMATIONS[name]
