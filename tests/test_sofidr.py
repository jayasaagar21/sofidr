"""
Tests for the SOFIDR reimplementation.

Run: pytest -q   (from the project root)
"""

import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pytest
from sklearn.model_selection import StratifiedKFold

from sofidr import SOFIDRFramework, KnowledgeBase, get_all
from sofidr.formations import FORMATIONS, enhance_dataset, iqr_filter
from sofidr.sei import compute_sei
from sofidr import terrain as terrain_mod
from sofidr.datasets import breast_cancer, imbalanced, noisy_missing


# --------------------------------------------------------------------------- #
def test_all_formations_build_and_score():
    X, y = breast_cancer()
    terr = terrain_mod.analyze(X, y)
    cv = StratifiedKFold(3, shuffle=True, random_state=0)
    for f in get_all():
        r = compute_sei(f, X, y, cv, minority_count=terr.minority_count)
        assert r.error == "", f"{f} errored: {r.error}"
        assert 0.0 <= r.sei <= 1.0


def test_outlier_filter_never_drops_a_class():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(200, 5))
    X[:5] *= 50  # extreme outliers
    y = np.r_[np.zeros(100), np.ones(100)].astype(int)
    Xf, yf = iqr_filter(X, y)
    assert set(np.unique(yf)) == {0, 1}
    assert len(yf) <= len(y)


def test_smote_makes_guerrilla_differ_from_reconnaissance():
    """The prototype bug: SMOTE unimplemented => guerrilla == reconnaissance.
    With SMOTE wired in on imbalanced data, they must differ."""
    X, y = imbalanced()
    terr = terrain_mod.analyze(X, y)
    cv = StratifiedKFold(3, shuffle=True, random_state=0)
    g = compute_sei("guerrilla", X, y, cv, minority_count=terr.minority_count)
    r = compute_sei("reconnaissance", X, y, cv, minority_count=terr.minority_count)
    assert g.error == "" and r.error == ""
    assert abs(g.sei - r.sei) > 1e-6


def test_no_leakage_feature_selection_inside_cv():
    """
    Regression test for the leak. We build pure-noise features with random
    labels. A leak-free supervised SelectKBest inside CV cannot exceed chance
    by much. The OLD approach (select on full data, then CV) inflates accuracy
    well above chance. We assert the leak-free path stays near chance.
    """
    rng = np.random.default_rng(0)
    X = rng.normal(size=(120, 200))          # 200 noise features
    y = rng.integers(0, 2, size=120)         # random labels
    terr = terrain_mod.analyze(X, y)
    cv = StratifiedKFold(3, shuffle=True, random_state=0)
    r = compute_sei("skirmisher", X, y, cv, minority_count=terr.minority_count)
    # leak-free accuracy on pure noise must be near 0.5, certainly < 0.70
    assert r.accuracy < 0.70, f"suspiciously high accuracy ({r.accuracy}) => leak"


def test_knowledge_persists_and_reloads(tmp_path):
    p = tmp_path / "kb.json"
    kb = KnowledgeBase(p)
    kb.update("sig:test", "phalanx", 0.8)
    kb.update("sig:test", "phalanx", 0.6)   # running mean -> 0.7
    kb.save()
    kb2 = KnowledgeBase(p)
    recs = kb2.recommendations("sig:test")
    assert recs and recs[0]["formation"] == "phalanx"
    assert abs(recs[0]["mean_reward"] - 0.7) < 1e-9
    assert recs[0]["n_runs"] == 2


def test_terrain_detects_imbalance_and_missing():
    X, y = noisy_missing()
    terr = terrain_mod.analyze(X, y)
    assert terr.missing_ratio > 0.05
    assert "severe_missing" in terr.tags()


def test_framework_returns_usable_pipeline(tmp_path):
    X, y = breast_cancer()
    kb = KnowledgeBase(tmp_path / "kb.json")
    fw = SOFIDRFramework(n_iterations=1, knowledge=kb)
    res = fw.execute(X, y)
    assert res.fitted_pipeline is not None
    preds = res.fitted_pipeline.predict(X[:10])
    assert len(preds) == 10
    assert res.best_by_sei in FORMATIONS


def test_enhancement_preserves_feature_and_target_names():
    rng = np.random.default_rng(12)
    X = rng.normal(size=(30, 4))
    y = np.array(["control", "case"] * 15)
    result = enhance_dataset(
        "reconnaissance",
        X,
        y,
        ["age", "score", "height", "weight"],
        "diagnosis",
    )

    assert list(result.dataframe.columns) == [
        "age", "score", "height", "weight", "diagnosis", "_sofidr_row_origin"
    ]
    assert result.dataframe["diagnosis"].tolist() == y.tolist()
    assert result.steps == ["impute"]


def test_enhancement_uses_pca_names_and_preserves_labels():
    rng = np.random.default_rng(4)
    X = rng.normal(size=(40, 8))
    y = np.array(["low", "high"] * 20)
    result = enhance_dataset(
        "heavy_cavalry", X, y, [f"sensor_{i}" for i in range(8)], "risk"
    )

    assert list(result.dataframe.columns[:5]) == [
        "pc_1", "pc_2", "pc_3", "pc_4", "pc_5"
    ]
    assert result.dataframe.columns[-2:].tolist() == ["risk", "_sofidr_row_origin"]
    assert set(result.dataframe["risk"]) == {"low", "high"}


def test_enhancement_reports_outlier_removal_as_original_provenance():
    rng = np.random.default_rng(8)
    X = rng.normal(scale=0.2, size=(40, 3))
    X[0] = 100
    y = np.array([0, 1] * 20)
    result = enhance_dataset("phalanx", X, y, ["a", "b", "c"], "target")

    assert result.removed_rows >= 1
    assert result.output_rows == result.input_rows - result.removed_rows
    assert set(result.dataframe["_sofidr_row_origin"]) == {"original"}


def test_smote_keeps_original_prefix_and_marks_generated_rows():
    rng = np.random.default_rng(21)
    X = rng.normal(size=(16, 3))
    y = np.array(["majority"] * 12 + ["minority"] * 4)
    result = enhance_dataset("guerrilla", X, y, ["x", "y", "z"], "class")

    assert result.synthetic_rows == 8
    assert result.dataframe["_sofidr_row_origin"].iloc[:16].eq("original").all()
    assert result.dataframe["_sofidr_row_origin"].iloc[16:].eq("synthetic").all()
    assert result.dataframe["class"].iloc[:16].tolist() == y.tolist()
    assert result.dataframe["class"].value_counts().to_dict() == {
        "majority": 12,
        "minority": 12,
    }
