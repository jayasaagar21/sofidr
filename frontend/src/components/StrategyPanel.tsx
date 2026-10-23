import React from "react"
import { OptimizeResponse } from "../api"
import InfoButton from "./InfoButton"

const pretty = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

/** Algorithm 1 thresholds, evaluated in the paper's order. */
const TERRAIN_RULES = [
  { key: "dim_ratio", label: "Dimensionality ratio (d/n)", test: (v: number) => v > 0.1, rule: "> 0.10", formation: "skirmisher" },
  { key: "missing_ratio", label: "Missing value ratio", test: (v: number) => v > 0.05, rule: "> 0.05", formation: "phalanx" },
  { key: "class_balance", label: "Class balance (min/max)", test: (v: number) => v < 0.5, rule: "< 0.50", formation: "guerrilla" },
  { key: "mean_abs_correlation", label: "Mean |correlation|", test: (v: number) => v > 0.7, rule: "> 0.70", formation: "heavy_cavalry" },
] as const

export default function StrategyPanel({
  optimize,
  note,
}: {
  optimize: OptimizeResponse | null
  note: string
}) {
  if (!optimize) {
    return note ? (
      <div className="strategy-panel is-skipped">
        <h3>SOFIDR formation strategy</h3>
        <p className="journey-caption">
          Formation scoring skipped: {note} Cleaning and Analytics still ran on the full file.
        </p>
      </div>
    ) : null
  }

  const t = optimize.terrain ?? {}
  const fired = TERRAIN_RULES.find((r) => typeof t[r.key] === "number" && r.test(t[r.key]))
  const ranked = [...optimize.scoreboard].sort((a, b) => b.sei - a.sei)
  const log = (optimize.refinement_log ?? []) as {
    iteration: number
    sigma: number
    current: string
    current_sei: number
    best_alternative: string
    alt_sei: number
    switched: boolean
  }[]
  const bench = optimize.benchmark

  return (
    <div className="strategy-panel">
      <div className="preview-heading">
        <h3>SOFIDR formation strategy</h3>
        <span>
          Label: <strong>{optimize.target_column ?? "benchmark label"}</strong>
          {optimize.target_reason ? ` (${optimize.target_reason})` : ""} ·{" "}
          {optimize.rows_evaluated ? `${optimize.rows_evaluated} rows scored` : ""}
        </span>
      </div>

      {/* Phase 1 */}
      <section className="strategy-phase">
        <header>
          <span className="strategy-step">1</span>
          <h4>Reconnaissance · data terrain τ(D)</h4>
          <InfoButton title="Why measure the terrain?" label="Why this is required" variant="why">
            <p>
              No preparation strategy is best for every dataset. Measuring dimensionality, missingness,
              class balance, correlation and sparsity first tells SOFIDR which formations are likely to
              fit before any model is trusted.
            </p>
          </InfoButton>
        </header>
        <div className="strategy-terrain">
          {TERRAIN_RULES.map((r) => {
            const v = t[r.key]
            const hit = typeof v === "number" && r.test(v)
            return (
              <div key={r.key} className={hit ? "is-hit" : undefined}>
                <span>{r.label}</span>
                <strong>{typeof v === "number" ? v.toFixed(3) : "—"}</strong>
                <small>
                  {r.rule} → {pretty(r.formation)}
                </small>
              </div>
            )
          })}
          <div>
            <span>Sparsity (zero share)</span>
            <strong>{typeof t.sparsity === "number" ? t.sparsity.toFixed(3) : "—"}</strong>
            <small>informational</small>
          </div>
        </div>
        {optimize.feature_columns?.length ? (
          <p className="journey-caption">
            Features scored: {optimize.feature_columns.join(", ")}
          </p>
        ) : null}
      </section>

      {/* Phase 2 */}
      <section className="strategy-phase">
        <header>
          <span className="strategy-step">2</span>
          <h4>Default formation · Algorithm 1</h4>
          <InfoButton title="Why a default formation?" label="Why this is required" variant="why">
            <p>
              With no prior knowledge (cold start), Algorithm 1 picks a sensible formation from the
              terrain alone so SOFIDR always has a defensible starting point. The SEI comparison then
              confirms or overrides it.
            </p>
          </InfoButton>
        </header>
        <p>
          <strong>{pretty(optimize.cold_start_default)}</strong> —{" "}
          {fired
            ? `${fired.label} is ${fired.rule}, the first rule that fires.`
            : "no threshold fired, so the balanced default applies."}
        </p>
      </section>

      {/* Phase 3 */}
      <section className="strategy-phase">
        <header>
          <span className="strategy-step">3</span>
          <h4>Multi-formation evaluation · SEI</h4>
          <InfoButton title="Why score every formation?" label="Why this is required" variant="why">
            <p>
              SEI = 0.40·Accuracy + 0.25·Stability + 0.20·Retention + 0.15·Simplicity. All six
              formations are cross-validated on the same folds, so the winner balances predictive
              power with robustness, data kept and minimal distortion — not accuracy alone.
            </p>
          </InfoButton>
        </header>
        <div className="table-container">
          <table className="sei-table">
            <thead>
              <tr>
                <th>Formation</th>
                <th>Accuracy ×0.40</th>
                <th>Stability ×0.25</th>
                <th>Retention ×0.20</th>
                <th>Simplicity ×0.15</th>
                <th>SEI</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.name} className={r.name === optimize.best_by_sei ? "is-best" : undefined}>
                  <td>{pretty(r.name)}</td>
                  <td>{r.accuracy.toFixed(3)}</td>
                  <td>{r.stability.toFixed(3)}</td>
                  <td>{r.retention.toFixed(3)}</td>
                  <td>{r.simplicity.toFixed(3)}</td>
                  <td>
                    <strong>{r.sei.toFixed(4)}</strong>
                    {r.error ? <small> · {r.error}</small> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bench?.conventional && (
          <p className="journey-caption">
            vs best conventional pipeline ({bench.conventional.label}, SEI{" "}
            {bench.conventional.sei.toFixed(4)}): {bench.delta_sei >= 0 ? "+" : ""}
            {bench.delta_sei.toFixed(4)} · winner {bench.winner}
          </p>
        )}
      </section>

      {/* Phase 4 */}
      <section className="strategy-phase">
        <header>
          <span className="strategy-step">4</span>
          <h4>Iterative refinement · perturbation σₜ = 0.01·t</h4>
          <InfoButton title="Why refine iteratively?" label="Why this is required" variant="why">
            <p>
              Real data drifts. Each round adds growing Gaussian noise and re-scores every formation;
              SOFIDR switches only if an alternative beats the current one by at least 3%, so the
              choice is robust rather than lucky.
            </p>
          </InfoButton>
        </header>
        {log.length ? (
          <ol className="refine-log">
            {log.map((row) => (
              <li key={row.iteration} className={row.switched ? "is-switch" : undefined}>
                <strong>Round {row.iteration}</strong> (σ={row.sigma}): {pretty(row.current)}{" "}
                {row.current_sei.toFixed(4)} vs best alternative {pretty(row.best_alternative)}{" "}
                {row.alt_sei.toFixed(4)} →{" "}
                {row.switched ? "switched (≥3% better)" : "kept (gap < 3%)"}
              </li>
            ))}
          </ol>
        ) : (
          <p className="journey-caption">Refinement not run for this request.</p>
        )}
      </section>

      <div className="strategy-verdict">
        <span>Recommended formation</span>
        <strong>{pretty(optimize.best_by_sei)}</strong>
        <small>
          ε-greedy policy (ε={optimize.epsilon ?? 0.15}) pick: {pretty(optimize.selected)} —{" "}
          {optimize.selection_reason}
        </small>
      </div>
    </div>
  )
}
