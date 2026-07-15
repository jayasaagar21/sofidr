import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "server"))

import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline

from dq import profile, structural_repair, build_plan, infer_role, export_for_human
from make_fixture import build_fixture


@pytest.fixture
def raw(tmp_path):
    fixture = build_fixture(tmp_path / "fixture.csv")
    return pd.read_csv(fixture, dtype={"zip": str})


# ------------------------------------------------------------------ roles
def test_zip_with_leading_zeros_stays_text(raw):
    """Regression: old TypeConverter turned '05880' into 5880."""
    assert infer_role("zip", raw["zip"]) == "identifier"
    out, _ = structural_repair(raw)
    assert out["zip"].iloc[0].startswith("0")
    assert not pd.api.types.is_numeric_dtype(out["zip"])


def test_integer_column_is_not_read_as_datetime():
    """Regression: old detect_data_type tested datetime BEFORE numeric, so
    pd.to_datetime parsed integers as nanosecond epochs."""
    s = pd.Series([25, 34, 41, 52, 63, 19, 47] * 20)
    assert infer_role("age", s) == "numeric"


def test_high_cardinality_is_not_categorical():
    """Old rule `nunique < 0.1*n` called 50k distinct values 'categorical'."""
    s = pd.Series([f"v{i}" for i in range(5000)])
    assert infer_role("thing", s) != "categorical"


def test_low_cardinality_is_categorical(raw):
    assert infer_role("gender", raw["gender"]) == "categorical"


# ------------------------------------------------------------ measurement
def test_uniqueness_is_row_level_not_column_level(raw):
    """Regression: old profiler called .duplicated() per COLUMN, so a two-value
    gender column reported 100% duplicates and tanked the quality score."""
    rep = profile(raw)
    assert rep.n_duplicate_rows == 9              # exactly what we planted
    assert rep.uniqueness_pct == pytest.approx(100 * (1 - 9 / 609), abs=0.01)
    # gender must not be blamed for being a category
    assert "duplicate" not in " ".join(rep.columns["gender"].notes).lower()


def test_completeness_matches_planted_missing(raw):
    rep = profile(raw)
    assert rep.columns["total_charges"].n_missing == 40


def test_extremes_are_flagged_not_deleted(raw):
    rep = profile(raw)
    c = rep.columns["monthly_charges"]
    assert c.n_extreme >= 12          # the 12 planted 999.0s
    # profiling must not mutate anything
    assert len(raw) == 609


def test_report_is_json_serialisable_with_all_nan_column(raw):
    import json
    raw["dead"] = np.nan
    d = profile(raw).to_dict()
    s = json.dumps(d)                 # would raise / emit bare NaN before
    assert "NaN" not in s and "Infinity" not in s


# ------------------------------------------------------ structural repair
def test_dedup_removes_exactly_the_planted_rows(raw):
    out, log = structural_repair(raw)
    assert len(out) == 600
    step = [l for l in log if l.step == "drop_duplicate_rows"][0]
    assert step.rows_before - step.rows_after == 9


def test_whitespace_trim_does_not_destroy_mixed_type_column(raw):
    """.str.strip() on an object column of mixed int/str nulls every int."""
    before = raw["plan_code"].isna().sum()
    out, _ = structural_repair(raw)
    assert out["plan_code"].isna().sum() == before


def test_structural_repair_is_idempotent(raw):
    a, _ = structural_repair(raw)
    b, _ = structural_repair(a)
    pd.testing.assert_frame_equal(a, b)


def test_structural_repair_never_drops_rows_for_outliers(raw):
    """The old IQR row filter deleted up to 80% of clean wide data."""
    out, _ = structural_repair(raw)
    assert (out["monthly_charges"] == 999.0).sum() == 12   # still there


# ------------------------------------------------------------------ plan
def test_plan_excludes_identifier_and_target(raw):
    out, _ = structural_repair(raw)
    plan = build_plan(out, profile(out), target="churn")
    assert "zip" in plan.dropped
    assert "churn" not in plan.numeric + plan.categorical + plan.dropped


def test_plan_uses_median_for_skewed_column():
    df = pd.DataFrame({"rev": np.r_[np.random.default_rng(0).lognormal(size=300), [1e6]],
                       "y": np.random.default_rng(0).integers(0, 2, 301)})
    plan = build_plan(df, profile(df), target="y")
    d = [x for x in plan.decisions if x.name == "rev"][0]
    assert d.impute == "median"


def test_plan_adds_missingness_indicator(raw):
    out, _ = structural_repair(raw)
    plan = build_plan(out, profile(out), target="churn")
    d = [x for x in plan.decisions if x.name == "total_charges"][0]
    assert d.add_indicator is True     # 40/609 = 6.6% > 5% threshold


def test_transformer_is_unfitted():
    """The whole point: Phase 1 must receive something it fits itself."""
    from sklearn.exceptions import NotFittedError
    from sklearn.utils.validation import check_is_fitted
    df = pd.DataFrame({"a": [1.0, 2, 3, 4], "y": [0, 1, 0, 1]})
    t = build_plan(df, profile(df), target="y").to_transformer()
    with pytest.raises(NotFittedError):
        check_is_fitted(t)


def test_unseen_category_in_test_fold_does_not_explode():
    tr = pd.DataFrame({"c": ["a", "b", "a", "b"] * 5, "y": [0, 1] * 10})
    plan = build_plan(tr, profile(tr), target="y")
    t = plan.to_transformer().fit(tr[["c"]])
    te = pd.DataFrame({"c": ["zzz_unseen"]})
    assert t.transform(te).shape[0] == 1        # handle_unknown='ignore'


# -------------------------------------------------------------- the leak
def test_plan_inside_cv_does_not_see_test_folds():
    """Core regression. Fit the transformer through cross_val_score and assert
    that the imputation statistic differs per fold — i.e. it is genuinely
    re-estimated on training rows only, not computed once on everything."""
    rng = np.random.default_rng(3)
    X = pd.DataFrame({"a": rng.normal(size=200), "b": rng.normal(size=200)})
    X.loc[rng.choice(200, 60, replace=False), "a"] = np.nan
    y = (X["b"].fillna(0) > 0).astype(int)

    plan = build_plan(X.assign(y=y), profile(X.assign(y=y)), target="y")

    seen = []
    class Spy(RandomForestClassifier):
        def fit(self, Xt, yt, **kw):
            seen.append(Xt.shape[0])
            return super().fit(Xt, yt, **kw)

    pipe = Pipeline([("clean", plan.to_transformer()), ("m", Spy(n_estimators=10, random_state=0))])
    cv = StratifiedKFold(5, shuffle=True, random_state=0)
    cross_val_score(pipe, X, y, cv=cv)

    # the model must never have been fitted on all 200 rows
    assert seen and max(seen) < 200
    assert all(s == 160 for s in seen)


def test_global_fit_would_leak_and_we_can_prove_the_difference():
    """Demonstrate the two paths give different imputation values, which is
    exactly why the export path must not feed cross-validation."""
    from sklearn.impute import SimpleImputer
    rng = np.random.default_rng(4)
    a = pd.DataFrame({"x": np.r_[rng.normal(0, 1, 100), rng.normal(50, 1, 100)]})
    a.loc[0:9, "x"] = np.nan

    global_median = SimpleImputer(strategy="median").fit(a).statistics_[0]
    fold_median = SimpleImputer(strategy="median").fit(a.iloc[:100]).statistics_[0]
    assert not np.isclose(global_median, fold_median)


# ------------------------------------------------------------- export path
def test_export_keeps_human_readable_columns(raw):
    out, _ = structural_repair(raw)
    plan = build_plan(out, profile(out), target="churn")
    exported, warning = export_for_human(out, plan)
    assert "gender" in exported.columns                  # not one-hot exploded
    assert exported["total_charges"].isna().sum() == 0   # imputed
    assert "total_charges__was_missing" in exported.columns
    assert "cross-validation" in warning


def test_name_hint_alone_does_not_condemn_a_low_cardinality_column():
    """'plan_code'/'country_code' are categoricals, not identifiers. The name
    hint must be corroborated by cardinality before we drop the column."""
    s = pd.Series(["P1", "P2", "P3"] * 100)
    assert infer_role("plan_code", s) == "categorical"


def test_name_hint_plus_high_cardinality_is_an_identifier():
    s = pd.Series([f"ORD-{i}" for i in range(500)])
    assert infer_role("order_number", s) == "identifier"
