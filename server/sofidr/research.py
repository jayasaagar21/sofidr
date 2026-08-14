"""Research mappings taken from the SOFIDR research paper (June 2026).

These entries document techniques inside the existing SOFIDR strategy.
They do not introduce a second strategy framework.
"""

from __future__ import annotations

from .formations import FORMATIONS

# Table 1 — Battle Formation Specifications (paper).
PAPER_FORMATION_TABLE = {
    "phalanx": {
        "imputation": "Median",
        "outlier_method": "IQR (1.5×)",
        "feature_select": "No",
        "decomposition": "No",
        "scaling": "Yes",
        "target_terrain": "General-purpose, moderate missingness",
    },
    "skirmisher": {
        "imputation": "Mean",
        "outlier_method": "None",
        "feature_select": "Yes (k=10)",
        "decomposition": "No",
        "scaling": "Yes",
        "target_terrain": "High-dimensional data (d/n > 0.1)",
    },
    "heavy_cavalry": {
        "imputation": "Median",
        "outlier_method": "Z-score (3σ)",
        "feature_select": "No",
        "decomposition": "PCA (5 components)",
        "scaling": "Yes",
        "target_terrain": "Highly correlated features",
    },
    "guerrilla": {
        "imputation": "Most frequent",
        "outlier_method": "None",
        "feature_select": "No",
        "decomposition": "No",
        "scaling": "Yes",
        "target_terrain": "Imbalanced classes (balance < 0.5)",
    },
    "scorched_earth": {
        "imputation": "Median",
        "outlier_method": "IQR (1.5×)",
        "feature_select": "Yes (k=10)",
        "decomposition": "PCA (5 components)",
        "scaling": "Yes",
        "target_terrain": "Maximum preprocessing (aggressive)",
    },
    "reconnaissance": {
        "imputation": "Mean",
        "outlier_method": "None",
        "feature_select": "No",
        "decomposition": "No",
        "scaling": "No",
        "target_terrain": "Clean data, minimal intervention",
    },
}

TECHNIQUE_CATALOG = [
    {
        "technique": "Median imputation",
        "problem_addressed": "Missing numeric values under skew",
        "suitable_conditions": "Moderate missingness; skewed numeric fields",
        "limitations": "Ignores feature interactions; invents values when missingness is extreme",
        "information_loss_risk": "Low to medium",
        "formations": ["phalanx", "heavy_cavalry", "scorched_earth"],
        "research_support": "SOFIDR paper Table 1; ISO/IEC 25012 completeness dimension",
    },
    {
        "technique": "Mean imputation",
        "problem_addressed": "Missing numeric values under approximate symmetry",
        "suitable_conditions": "Low/moderate missingness; roughly symmetric distributions",
        "limitations": "Sensitive to outliers; can shrink variance",
        "information_loss_risk": "Medium",
        "formations": ["skirmisher", "reconnaissance"],
        "research_support": "SOFIDR paper Table 1",
    },
    {
        "technique": "Most-frequent imputation",
        "problem_addressed": "Missing categorical/discrete values",
        "suitable_conditions": "Class-imbalanced or categorical-dominant terrain",
        "limitations": "Can reinforce majority categories",
        "information_loss_risk": "Medium",
        "formations": ["guerrilla"],
        "research_support": "SOFIDR paper Table 1",
    },
    {
        "technique": "IQR outlier filtering",
        "problem_addressed": "Extreme values distorting scale-sensitive steps",
        "suitable_conditions": "Moderate contamination; defensive general-purpose terrain",
        "limitations": "May drop rare but valid minority cases",
        "information_loss_risk": "Medium to high",
        "formations": ["phalanx", "scorched_earth"],
        "research_support": "SOFIDR paper Table 1",
    },
    {
        "technique": "Z-score outlier filtering",
        "problem_addressed": "Extreme values under roughly Gaussian margins",
        "suitable_conditions": "Highly correlated / scale-sensitive terrain",
        "limitations": "Mean/std sensitive to the contamination being detected",
        "information_loss_risk": "Medium to high",
        "formations": ["heavy_cavalry"],
        "research_support": "SOFIDR paper Table 1",
    },
    {
        "technique": "SelectKBest feature selection",
        "problem_addressed": "High dimensionality and redundant signals",
        "suitable_conditions": "d/n > 0.1 or aggressive preprocessing terrain",
        "limitations": "Supervised selection must stay inside fold-safe pipelines",
        "information_loss_risk": "High if k is too aggressive",
        "formations": ["skirmisher", "scorched_earth"],
        "research_support": "SOFIDR paper Table 1; Reddy et al. dimensionality-reduction discussion",
    },
    {
        "technique": "PCA decomposition",
        "problem_addressed": "Correlated / redundant feature spaces",
        "suitable_conditions": "High mean absolute correlation",
        "limitations": "Reduces interpretability; can discard minority signal",
        "information_loss_risk": "High",
        "formations": ["heavy_cavalry", "scorched_earth"],
        "research_support": "SOFIDR paper Table 1 and Related Work §2.1",
    },
    {
        "technique": "Standard / robust scaling",
        "problem_addressed": "Heterogeneous feature scales",
        "suitable_conditions": "Most non-minimal formations",
        "limitations": "Scale-invariant models may gain little; robust scaling preferred with extremes",
        "information_loss_risk": "Low",
        "formations": ["phalanx", "skirmisher", "heavy_cavalry", "guerrilla", "scorched_earth"],
        "research_support": "SOFIDR paper Table 1",
    },
]


def formation_research(name: str) -> dict:
    formation = FORMATIONS[name]
    paper = PAPER_FORMATION_TABLE.get(name)
    return {
        "formation": name,
        "paper": formation.paper,
        "target_terrain": formation.target_terrain,
        "table_1": paper,
        "techniques": [
            item for item in TECHNIQUE_CATALOG if name in item["formations"]
        ],
        "note": (
            "Paper Table 1 formation"
            if formation.paper
            else "Implementation extra outside the six paper formations"
        ),
    }


def research_bundle(best_formation: str) -> dict:
    return {
        "source": {
            "title": "SOFIDR: Strategic Optimization Framework for Iterative Data Regeneration",
            "date": "June 2026",
            "phases": [
                "Phase 0 — Reconnaissance",
                "Phase 1 — Multi-Formation Evaluation",
                "Phase 2 — Iterative Refinement",
            ],
            "sei_weights": {
                "accuracy": 0.40,
                "stability": 0.25,
                "retention": 0.20,
                "simplicity": 0.15,
            },
            "algorithm_1": "Default Assumption Mechanism for cold-start formation selection",
            "baselines": "None, Standard, PCA, Full (Section 5.2)",
        },
        "selected_formation": formation_research(best_formation),
        "techniques": TECHNIQUE_CATALOG,
        "paper_formations": list(PAPER_FORMATION_TABLE),
    }
