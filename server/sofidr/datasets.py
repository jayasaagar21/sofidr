"""
The five dataset archetypes from the paper (Table 2), for reproducing Tables
3-4 honestly. Synthetic generators are seeded for determinism. Exact column/row
counts and class ratios follow Table 2; the synthetic seeds will not bitwise-
match the authors' unspecified seeds, but the archetypes are equivalent.
"""

from __future__ import annotations

import numpy as np
from sklearn.datasets import make_classification, load_breast_cancer


def breast_cancer():
    d = load_breast_cancer()
    return d.data, d.target


def high_dimensional(random_state=42):
    X, y = make_classification(
        n_samples=300, n_features=40, n_informative=15, n_redundant=5,
        n_classes=2, weights=[0.5, 0.5], random_state=random_state)
    return X, y


def imbalanced(random_state=42):
    X, y = make_classification(
        n_samples=500, n_features=20, n_informative=10, n_redundant=3,
        n_classes=2, weights=[0.85, 0.15], random_state=random_state)
    return X, y


def noisy_missing(random_state=42, missing_frac=0.08, label_noise=0.25):
    rng = np.random.default_rng(random_state)
    X, y = make_classification(
        n_samples=400, n_features=15, n_informative=8, n_redundant=2,
        n_classes=2, weights=[0.5, 0.5], flip_y=label_noise,
        random_state=random_state)
    mask = rng.random(X.shape) < missing_frac
    X = X.copy()
    X[mask] = np.nan
    return X, y


def correlated(random_state=42):
    X, y = make_classification(
        n_samples=350, n_features=25, n_informative=5, n_redundant=20,
        n_classes=2, weights=[0.5, 0.5], random_state=random_state)
    return X, y


ARCHETYPES = {
    "breast_cancer": breast_cancer,
    "high_dimensional": high_dimensional,
    "imbalanced": imbalanced,
    "noisy_missing": noisy_missing,
    "correlated": correlated,
}
