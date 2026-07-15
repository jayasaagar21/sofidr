"""
SOFIDRFramework -- orchestration of the three phases.

  Phase 0  Reconnaissance        terrain.analyze + Algorithm 1 default
  Phase 1  Multi-formation eval  leak-free SEI for every formation (shared folds)
  Phase 2  Iterative refinement  perturb data, re-evaluate, switch if >3% better

Selection exposes both:
  * best_by_sei  -- deterministic argmax on this run (the defensible headline)
  * selected     -- epsilon-greedy bandit policy over persisted knowledge

The final chosen pipeline is fitted on the full data and returned, so the result
is directly usable: `result.fitted_pipeline.transform(X_new)`.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold

from . import terrain as terrain_mod
from .formations import FORMATIONS, get_all
from .knowledge import KnowledgeBase
from .sei import compute_sei, SEIResult


@dataclass
class SOFIDRResult:
    terrain: terrain_mod.Terrain
    cold_start_default: str
    sei_results: dict[str, SEIResult]
    best_by_sei: str
    selected: str
    selection_reason: str
    refinement_log: list[dict] = field(default_factory=list)
    fitted_pipeline: object = None

    def scores(self) -> dict[str, float]:
        return {k: v.sei for k, v in self.sei_results.items()}

    def ranked(self) -> list[SEIResult]:
        return sorted(self.sei_results.values(), key=lambda r: r.sei, reverse=True)


class SOFIDRFramework:
    def __init__(
        self,
        n_iterations: int = 3,
        epsilon: float = 0.15,
        include_extras: bool = True,
        base_estimator=None,
        cv_folds: int = 3,
        knowledge: Optional[KnowledgeBase] = None,
        random_state: int = 42,
        persist: bool = True,
    ):
        self.n_iterations = n_iterations
        self.epsilon = epsilon
        self.candidates = get_all(include_extras=include_extras)
        self.base_estimator = (
            base_estimator if base_estimator is not None
            else RandomForestClassifier(n_estimators=50, random_state=random_state)
        )
        self.cv_folds = cv_folds
        self.kb = knowledge if knowledge is not None else KnowledgeBase()
        self.random_state = random_state
        self.persist = persist
        self._rng = random.Random(random_state)

    # --------------------------------------------------------------------- #
    def _evaluate_all(self, X, y, minority_count) -> dict[str, SEIResult]:
        cv = StratifiedKFold(n_splits=self.cv_folds, shuffle=True,
                             random_state=self.random_state)
        results = {}
        for name in self.candidates:
            results[name] = compute_sei(
                name, X, y, cv,
                base_estimator=self.base_estimator,
                minority_count=minority_count,
            )
        return results

    # --------------------------------------------------------------------- #
    def execute(self, X, y) -> SOFIDRResult:
        X = np.asarray(X, dtype=float)
        y = np.asarray(y)

        # Phase 0 -- Reconnaissance
        terr = terrain_mod.analyze(X, y)
        cold_default = terrain_mod.default_formation(terr)
        sig = terr.signature()

        # Phase 1 -- Multi-formation evaluation (leak-free, shared folds)
        results = self._evaluate_all(X, y, terr.minority_count)
        scores = {k: v.sei for k, v in results.items()}
        best_by_sei = max(scores, key=scores.get)

        # update cross-run knowledge with every evaluated formation
        for name, res in results.items():
            if not res.error:
                self.kb.update(sig, name, res.sei)

        # Phase 2 -- Iterative refinement on perturbed data
        current = best_by_sei
        log = []
        for i in range(1, self.n_iterations + 1):
            sigma = 0.01 * i
            Xp = X + self._rng_normal(X.shape, sigma)
            cv = StratifiedKFold(n_splits=self.cv_folds, shuffle=True,
                                 random_state=self.random_state)
            cur_sei = compute_sei(current, Xp, y, cv, self.base_estimator,
                                  terr.minority_count).sei
            best_alt, best_alt_sei = current, cur_sei
            for name in self.candidates:
                if name == current:
                    continue
                s = compute_sei(name, Xp, y, cv, self.base_estimator,
                                terr.minority_count).sei
                if s > best_alt_sei:
                    best_alt, best_alt_sei = name, s
            switched = best_alt != current and best_alt_sei > cur_sei * 1.03
            log.append({
                "iteration": i, "sigma": round(sigma, 4),
                "current": current, "current_sei": round(cur_sei, 4),
                "best_alternative": best_alt, "alt_sei": round(best_alt_sei, 4),
                "switched": switched,
            })
            if switched:
                current = best_alt

        # Selection -- epsilon-greedy bandit policy over persisted knowledge
        selected, reason = self.kb.select(
            sig, self.candidates, run_scores=scores,
            epsilon=self.epsilon, rng=self._rng)

        if self.persist:
            self.kb.save()

        # Fit the deterministic best on full data so the result is usable.
        pipe = FORMATIONS[best_by_sei].build_pipeline(X.shape[1], terr.minority_count)
        pipe.steps.append(("clf", clone(self.base_estimator)))
        try:
            pipe.fit(X, y)
        except Exception:  # noqa: BLE001
            pipe = None

        return SOFIDRResult(
            terrain=terr,
            cold_start_default=cold_default,
            sei_results=results,
            best_by_sei=best_by_sei,
            selected=selected,
            selection_reason=reason,
            refinement_log=log,
            fitted_pipeline=pipe,
        )

    # --------------------------------------------------------------------- #
    def _rng_normal(self, shape, sigma):
        # numpy RNG seeded per call deterministically off self.random_state
        rng = np.random.default_rng(self.random_state + int(sigma * 1000))
        return rng.normal(0, sigma, shape)
