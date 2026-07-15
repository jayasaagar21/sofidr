"""Render a SOFIDRResult as the structured report (real numbers, no fabrication)."""

from __future__ import annotations

from .framework import SOFIDRResult
from .formations import FORMATIONS


def render(result: SOFIDRResult, dataset_name: str = "dataset") -> str:
    t = result.terrain
    best = result.sei_results[result.best_by_sei]
    f = FORMATIONS[result.best_by_sei]
    lines = []

    lines.append(f"## Mission: optimize preprocessing for '{dataset_name}'\n")

    lines.append("### Terrain Analysis")
    lines.append(f"- Shape: {t.n_samples} samples x {t.n_features} features "
                 f"(d/n = {t.dim_ratio:.3f})")
    lines.append(f"- Missing ratio: {t.missing_ratio:.1%}")
    lines.append(f"- Class balance: {t.class_balance:.2f} "
                 f"(minority n={t.minority_count})")
    lines.append(f"- Mean |correlation|: {t.mean_abs_correlation:.2f}")
    lines.append(f"- Terrain tags: {', '.join(t.tags())}")
    lines.append(f"- Cold-start default (Algorithm 1): {result.cold_start_default}\n")

    lines.append(f"### Strategy: {f.icon} {result.best_by_sei} "
                 f"(best SEI = {best.sei:.4f})")
    lines.append(f"Target terrain for this formation: {f.target_terrain}.")
    lines.append(f"Bandit policy selected: {result.selected} "
                 f"({result.selection_reason}).\n")

    lines.append("### Formation Scoreboard (leak-free, shared CV folds)")
    lines.append(f"{'formation':16s} {'SEI':>7s} {'acc':>7s} {'stab':>7s} "
                 f"{'reten':>7s} {'simp':>7s}  notes")
    for r in result.ranked():
        tag = " [extra]" if not FORMATIONS[r.formation].paper else ""
        err = f"  ERROR {r.error}" if r.error else ""
        lines.append(f"{r.formation:16s} {r.sei:7.4f} {r.accuracy:7.4f} "
                     f"{r.stability:7.4f} {r.retention:7.3f} {r.simplicity:7.3f}"
                     f"{tag}{err}")
    lines.append("")

    if result.refinement_log:
        lines.append("### Iterative Refinement")
        for it in result.refinement_log:
            sw = "SWITCH -> " + it["best_alternative"] if it["switched"] else "hold"
            lines.append(f"  iter {it['iteration']} (sigma={it['sigma']}): "
                         f"{it['current']} SEI={it['current_sei']} | {sw}")
        lines.append("")

    lines.append("### SEI components")
    lines.append("SEI = 0.40*accuracy + 0.25*stability + 0.20*retention "
                 "+ 0.15*simplicity")
    lines.append(f"For '{result.best_by_sei}': accuracy={best.accuracy:.4f}, "
                 f"stability={best.stability:.4f}, retention={best.retention:.3f}, "
                 f"simplicity={best.simplicity:.3f}")
    return "\n".join(lines)
