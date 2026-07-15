"""
Cross-run knowledge base + epsilon-greedy formation selection.

This makes real two mechanisms the paper claims but the prototype did not
contain:

* "Accumulated meta-knowledge across dataset evaluations" -- the prototype kept
  no state whatsoever; nothing survived a run. Here, per-(terrain signature,
  formation) reward statistics persist to a JSON file and are updated with a
  running mean after every evaluation.

* "Epsilon-greedy multi-armed bandit formation selection" -- the prototype
  stored `exploration_rate` and never used it; selection was a plain argmax.
  Here selection is genuinely epsilon-greedy over the persisted reward
  estimates, falling back to the current run's SEI scores (and then to
  Algorithm 1) when a terrain has no history yet.
"""

from __future__ import annotations

import json
import os
import random
from pathlib import Path

DEFAULT_PATH = Path(os.environ.get("SOFIDR_KNOWLEDGE", Path("/tmp") / ".sofidr" / "knowledge.json"))


class KnowledgeBase:
    def __init__(self, path: Path | str = DEFAULT_PATH):
        self.path = Path(path)
        self._store: dict[str, dict[str, dict]] = {}
        self._load()

    # --------------------------------------------------------------------- #
    def _load(self):
        if self.path.exists():
            try:
                self._store = json.loads(self.path.read_text())
            except (json.JSONDecodeError, OSError):
                self._store = {}

    def save(self):
        # NOTE ON SERVERLESS: the default path is /tmp because a Vercel
        # function's filesystem is read-only everywhere else — the previous
        # default of ~/.sofidr/ raised OSError on every call in production.
        #
        # /tmp stops the crash but does NOT make this durable. /tmp is
        # per-instance and wiped on cold start, so on Vercel the epsilon-greedy
        # bandit's "prior knowledge" is scoped to one warm container:
        # concurrent users see different knowledge, and it resets without
        # warning. The selection_reason field will still say "exploit prior
        # knowledge (N runs)" — treat that N as per-container, not global.
        #
        # Durable cross-run learning needs shared state. Supabase is already a
        # project dependency; a `knowledge` table is the intended fix. Until
        # then, do not present the learning curve to a client as cumulative.
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self._store, indent=2, sort_keys=True))
        except OSError:
            # Read-only FS: degrade to in-memory rather than 500 the request.
            pass

    # --------------------------------------------------------------------- #
    def update(self, signature: str, formation: str, reward: float):
        """Incremental running mean of SEI reward for (terrain, formation)."""
        bucket = self._store.setdefault(signature, {})
        rec = bucket.setdefault(formation, {"n": 0, "mean": 0.0})
        rec["n"] += 1
        rec["mean"] += (reward - rec["mean"]) / rec["n"]

    def recommendations(self, signature: str) -> list[dict]:
        """Ranked formations for a terrain with confidence ~ sample count."""
        bucket = self._store.get(signature, {})
        out = [
            {
                "formation": f,
                "mean_reward": round(rec["mean"], 4),
                "n_runs": rec["n"],
                "confidence": round(1.0 - 1.0 / (1.0 + rec["n"]), 3),
            }
            for f, rec in bucket.items()
        ]
        return sorted(out, key=lambda r: r["mean_reward"], reverse=True)

    def export(self) -> dict:
        return json.loads(json.dumps(self._store))  # deep copy

    # --------------------------------------------------------------------- #
    def select(
        self,
        signature: str,
        candidates: list[str],
        run_scores: dict[str, float] | None = None,
        epsilon: float = 0.15,
        rng: random.Random | None = None,
    ) -> tuple[str, str]:
        """
        Epsilon-greedy selection. Returns (formation, reason).
        With probability epsilon -> explore a random candidate.
        Otherwise exploit the best known mean reward for this terrain, falling
        back to this run's SEI scores when the terrain is unseen.
        """
        rng = rng or random
        if rng.random() < epsilon:
            return rng.choice(candidates), "explore (epsilon-greedy)"

        bucket = self._store.get(signature, {})
        known = {f: bucket[f]["mean"] for f in candidates if f in bucket}
        if known:
            best = max(known, key=known.get)
            return best, f"exploit prior knowledge ({bucket[best]['n']} runs)"

        if run_scores:
            best = max(run_scores, key=run_scores.get)
            return best, "exploit current-run SEI (cold terrain)"

        return candidates[0], "fallback default"
