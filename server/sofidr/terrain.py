"""
Phase 0 -- Reconnaissance: characterize the data 'terrain'.

This computes the full terrain vector the paper's Definition 1 / Algorithm 1
refer to, including mean absolute feature correlation, which the original
prototype's `_detect_data_characteristics` never actually computed (Algorithm 1
then branched on a `tau_correlation` value that did not exist).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np


@dataclass
class Terrain:
    n_samples: int
    n_features: int
    missing_ratio: float
    class_balance: float        # min class count / max class count  (1.0 = balanced)
    dim_ratio: float            # d / n
    mean_abs_correlation: float
    minority_count: int

    def as_dict(self) -> dict:
        return asdict(self)

    # Discretized signature used as the key for cross-run knowledge. ----------- #
    def signature(self) -> str:
        return "|".join([
            f"dim:{'hi' if self.dim_ratio > 0.10 else 'lo'}",
            f"miss:{'hi' if self.missing_ratio > 0.05 else 'lo'}",
            f"bal:{'hi' if self.class_balance < 0.50 else 'lo'}",  # hi = imbalanced
            f"corr:{'hi' if self.mean_abs_correlation > 0.70 else 'lo'}",
        ])

    def tags(self) -> list[str]:
        t = []
        if self.dim_ratio > 0.10:
            t.append("high_dimensional")
        if self.missing_ratio > 0.05:
            t.append("severe_missing")
        elif self.missing_ratio > 0:
            t.append("some_missing")
        if self.class_balance < 0.50:
            t.append("imbalanced")
        if self.mean_abs_correlation > 0.70:
            t.append("high_correlation")
        if not t:
            t.append("well_behaved")
        return t


def analyze(X: np.ndarray, y: np.ndarray) -> Terrain:
    X = np.asarray(X, dtype=float)
    y = np.asarray(y)
    n, d = X.shape

    missing_ratio = float(np.isnan(X).sum()) / X.size if np.isnan(X).any() else 0.0

    counts = np.bincount(y.astype(int))
    counts = counts[counts > 0]
    class_balance = float(counts.min() / counts.max())
    minority_count = int(counts.min())

    # Correlation must be computed on complete data; impute column means first.
    if np.isnan(X).any():
        col_mean = np.nanmean(X, axis=0)
        idx = np.where(np.isnan(X))
        Xc = X.copy()
        Xc[idx] = np.take(col_mean, idx[1])
    else:
        Xc = X

    if d > 1:
        corr = np.corrcoef(Xc, rowvar=False)
        off = corr[~np.eye(d, dtype=bool)]
        off = off[~np.isnan(off)]
        mean_abs_corr = float(np.abs(off).mean()) if off.size else 0.0
    else:
        mean_abs_corr = 0.0

    return Terrain(
        n_samples=n,
        n_features=d,
        missing_ratio=missing_ratio,
        class_balance=class_balance,
        dim_ratio=d / n,
        mean_abs_correlation=mean_abs_corr,
        minority_count=minority_count,
    )


def default_formation(terrain: Terrain) -> str:
    """
    Algorithm 1 (Default Assumption Mechanism), implemented faithfully and with
    the HEAVY_CAVALRY typo from the paper ('HEAVY_CAVARY') corrected.
    Used for cold-start when no cross-run knowledge exists for this terrain.
    """
    if terrain.dim_ratio > 0.10:
        return "skirmisher"
    if terrain.missing_ratio > 0.05:
        return "phalanx"
    if terrain.class_balance < 0.50:
        return "guerrilla"
    if terrain.mean_abs_correlation > 0.70:
        return "heavy_cavalry"
    return "phalanx"
