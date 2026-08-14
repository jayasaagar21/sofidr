"""Deterministic dataset intelligence used before SOFIDR comparison.

This module measures a dataset; it does not select or replace a SOFIDR
formation. Its findings are inputs to SOFIDR reconnaissance and are kept
separate from the framework's existing terrain and SEI decision logic.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

import numpy as np
import pandas as pd

from .core import Report, profile

QUALITY_WEIGHTS = {
    "completeness": 0.45,
    "uniqueness": 0.25,
    "validity": 0.30,
}

_DOMAIN_HINTS = {
    "Financial": ("amount", "price", "cost", "revenue", "payment", "account", "balance", "invoice"),
    "Transactional": ("transaction", "order", "purchase", "product", "quantity", "customer"),
    "Customer": ("customer", "client", "email", "phone", "address", "age"),
    "Healthcare": ("patient", "diagnosis", "clinical", "medical", "hospital", "health"),
    "Marketing": ("campaign", "click", "impression", "lead", "conversion", "channel"),
    "Inventory": ("stock", "inventory", "warehouse", "sku", "supplier"),
    "IoT": ("sensor", "device", "temperature", "pressure", "reading"),
    "Survey": ("response", "respondent", "question", "rating", "satisfaction"),
    "Operational": ("status", "department", "employee", "shift", "region"),
}
_TARGET_HINT = re.compile(r"(^|_)(target|label|class|outcome|result|churn|fraud|default|diagnosis)($|_)", re.I)
_IMPORTANT_HINT = re.compile(
    r"(^|_)(id|customer|patient|account|amount|price|cost|revenue|balance|status|target|label|date|time)($|_)",
    re.I,
)


def _severity(percent: float, critical: bool = False) -> str:
    if critical or percent >= 60:
        return "Critical"
    if percent >= 25:
        return "High"
    if percent >= 5:
        return "Medium"
    return "Low"


def _priority(column: dict[str, Any], issue_pct: float) -> int:
    """Configurable-by-code, transparent priority score in the range 0–100."""
    importance = 30 if _IMPORTANT_HINT.search(column["name"]) else 15
    role_weight = {
        "identifier": 25,
        "numeric": 20,
        "datetime": 20,
        "categorical": 15,
        "text": 10,
    }.get(column["role"], 5)
    issue_weight = min(50, round(issue_pct * 0.5))
    return min(100, importance + role_weight + issue_weight)


def _issue(
    kind: str,
    column: dict[str, Any],
    records: int,
    pct: float,
    impact: str,
    techniques: list[str],
    critical: bool = False,
) -> dict[str, Any]:
    return {
        "issue": kind,
        "column": column["name"],
        "records_affected": records,
        "percentage_affected": round(pct, 3),
        "severity": _severity(pct, critical),
        "priority_score": _priority(column, pct),
        "potential_impact": impact,
        "applicable_techniques": techniques,
        "research_basis": "ISO/IEC 25012 and DAMA-DMBOK measurements; SOFIDR applies techniques inside leak-free formations.",
    }


def _classification(columns: list[dict[str, Any]], override: str | None) -> dict[str, str]:
    if override:
        return {"name": override, "source": "manual override"}
    tokens = " ".join(column["name"].lower() for column in columns)
    matches = Counter(
        {
            name: sum(token in tokens for token in hints)
            for name, hints in _DOMAIN_HINTS.items()
        }
    )
    name, count = matches.most_common(1)[0]
    return {
        "name": name if count else "Generic structured data",
        "source": "deterministic column-name signals" if count else "no domain signal detected",
    }


def _correlations(df: pd.DataFrame) -> list[dict[str, Any]]:
    numeric = df.select_dtypes(include="number")
    if numeric.shape[1] < 2:
        return []
    corr = numeric.corr(numeric_only=True).abs()
    pairs: list[dict[str, Any]] = []
    for index, left in enumerate(corr.columns):
        for right in corr.columns[index + 1:]:
            value = corr.loc[left, right]
            if np.isfinite(value) and value >= 0.7:
                pairs.append({"left": str(left), "right": str(right), "absolute_correlation": round(float(value), 4)})
    return sorted(pairs, key=lambda pair: pair["absolute_correlation"], reverse=True)[:20]


def analyze_dataset(df: pd.DataFrame, classification_override: str | None = None) -> dict[str, Any]:
    """Return an explainable pre-reconnaissance profile for a tabular dataset."""
    report: Report = profile(df)
    columns = list(report.to_dict()["columns"].values())
    issues: list[dict[str, Any]] = []

    for column in columns:
        if column["n_missing"]:
            issues.append(_issue(
                "Missing values", column, column["n_missing"], column["pct_missing"],
                "Can reduce usable coverage or require fold-safe imputation.",
                ["median or mode imputation", "missingness indicator", "record retention"],
            ))
        if column["n_uncastable"]:
            pct = 100 * column["n_uncastable"] / max(column["n"], 1)
            issues.append(_issue(
                "Invalid values", column, column["n_uncastable"], pct,
                "Can invalidate type-dependent analysis and downstream models.",
                ["type normalization", "value validation", "missing-value treatment"],
            ))
        if column["n_extreme"]:
            issues.append(_issue(
                "Extreme values", column, column["n_extreme"], column["pct_extreme"],
                "May distort scale-sensitive transformations and estimates.",
                ["IQR filtering", "robust scaling", "outlier review"],
            ))
        if column["role"] in {"empty", "constant"}:
            issues.append(_issue(
                "Non-informative column", column, column["n"], 100.0,
                "Adds no analytical signal and can obscure the usable schema.",
                ["structural removal", "retain for audit"],
                critical=column["role"] == "empty",
            ))

    if report.n_duplicate_rows:
        dataset_column = {"name": "Dataset rows", "role": "dataset"}
        pct = 100 * report.n_duplicate_rows / max(report.n_rows, 1)
        issues.append(_issue(
            "Duplicate rows", dataset_column, report.n_duplicate_rows, pct,
            "Can overrepresent records and bias totals or model fitting.",
            ["exact duplicate removal", "duplicate matching review"],
        ))

    issues.sort(key=lambda issue: (issue["priority_score"], issue["percentage_affected"]), reverse=True)
    quality_score = round(sum(
        QUALITY_WEIGHTS[dimension] * value
        for dimension, value in {
            "completeness": report.completeness_pct,
            "uniqueness": report.uniqueness_pct,
            "validity": report.validity_pct,
        }.items()
    ), 2)
    target_candidates = [
        column["name"] for column in columns
        if _TARGET_HINT.search(column["name"])
        or (
            column["role"] == "categorical"
            and 2 <= column["n_unique"] <= min(20, max(2, report.n_rows // 5))
        )
    ][:10]

    return {
        "dataset": {
            "rows": report.n_rows,
            "columns": report.n_cols,
            "input_fingerprint": report.input_sha256,
            "classification": _classification(columns, classification_override),
            "potential_target_fields": target_candidates,
        },
        "quality": {
            "score": quality_score,
            "label": (
                "Excellent" if quality_score >= 90 else "Strong" if quality_score >= 80
                else "Acceptable" if quality_score >= 70 else "Needs improvement"
                if quality_score >= 60 else "High risk"
            ),
            "method": "Transparent weighted indicator, not ground-truth accuracy.",
            "weights": QUALITY_WEIGHTS,
            "dimensions": {
                "completeness": report.completeness_pct,
                "uniqueness": report.uniqueness_pct,
                "validity": report.validity_pct,
            },
        },
        "columns": columns,
        "issues": issues,
        "correlations": _correlations(df),
        "priority_formula": (
            "Priority / 100 = issue impact (up to 50) + field importance (15 or 30) "
            "+ role weight (5–25), capped at 100."
        ),
    }
