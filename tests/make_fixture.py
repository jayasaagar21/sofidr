"""
Fixture with DELIBERATE, COUNTED defects.
Every defect below is planted so we know the exact right answer.
"""
from pathlib import Path

import numpy as np
import pandas as pd


def build_fixture(output: str | Path) -> Path:
    """Build the deterministic test CSV at a caller-provided location."""
    rng = np.random.default_rng(7)
    n = 600

    df = pd.DataFrame({
        "tenure_months": rng.integers(1, 72, n),
        "monthly_charges": np.round(rng.normal(70, 15, n), 2),
        "total_charges": np.round(rng.normal(2000, 600, n), 2),
        "zip": [f"0{rng.integers(1000, 9999)}" for _ in range(n)],
        "plan_code": [
            int(value) if i % 3 else f"P{value}"
            for i, value in enumerate(rng.integers(1, 9, n))
        ],
        "gender": rng.choice(["M", "F"], n),
        "city": rng.choice(["  Bengaluru", "Buffalo  ", " Pune "], n),
        "churn": rng.choice([0, 1], n, p=[0.82, 0.18]),
    })

    df.loc[list(range(0, 12)), "monthly_charges"] = 999.0
    df.loc[list(range(100, 140)), "total_charges"] = np.nan
    df = pd.concat([df, df.iloc[200:209].copy()], ignore_index=True)

    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(destination, index=False)
    return destination


if __name__ == "__main__":
    path = build_fixture(Path(__file__).with_name("fixture.csv"))
    print(f"Wrote deterministic fixture to {path}")
