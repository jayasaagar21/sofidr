import React, { useMemo } from "react"
import { CleanResponse, DatasetProfile, OptimizeResponse } from "../api"
import { buildStoryReport, SEI_WEIGHTS } from "../lib/storyReport"
import { Button } from "./ui/Button"
import ShareSummary from "./ShareSummary"

interface VisualizationReportProps {
  optimize?: OptimizeResponse | null
  profile?: DatasetProfile | null
  cleaning?: CleanResponse | null
  sourceName?: string
  onClose: () => void
}

function BarChart({
  items,
  max,
  valueFormat = (v: number) => v.toFixed(3),
}: {
  items: { label: string; value: number; highlight?: boolean }[]
  max?: number
  valueFormat?: (v: number) => string
}) {
  const ceiling = max ?? Math.max(...items.map((i) => i.value), 0.001)
  return (
    <ul className="viz-bars" aria-label="Bar chart">
      {items.map((item) => (
        <li key={item.label} className={item.highlight ? "is-highlight" : undefined}>
          <div className="viz-bar-meta">
            <span>{item.label}</span>
            <strong>{valueFormat(item.value)}</strong>
          </div>
          <div className="viz-bar-track">
            <span style={{ width: `${Math.max(2, (100 * item.value) / ceiling)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ComponentRing({
  components,
}: {
  components: { label: string; value: number; weight: number }[]
}) {
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const radius = 78
  let angle = -Math.PI / 2
  const slices = components.map((c) => {
    const sweep = c.weight * Math.PI * 2
    const start = angle
    angle += sweep
    const end = angle
    const large = sweep > Math.PI ? 1 : 0
    const x1 = cx + radius * Math.cos(start)
    const y1 = cy + radius * Math.sin(start)
    const x2 = cx + radius * Math.cos(end)
    const y2 = cy + radius * Math.sin(end)
    return { ...c, d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z` }
  })
  const colors = ["#c9f76f", "#8fd3a0", "#6aa8ff", "#f0c674"]

  return (
    <div className="viz-ring">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="SEI weight composition">
        {slices.map((slice, index) => (
          <path key={slice.label} d={slice.d} fill={colors[index % colors.length]} opacity={0.85} />
        ))}
        <circle cx={cx} cy={cy} r={46} fill="#101411" />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#f7f6f2" fontSize="14" fontWeight="700">
          SEI
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#a7aca5" fontSize="10">
          paper weights
        </text>
      </svg>
      <ul>
        {components.map((c, index) => (
          <li key={c.label}>
            <i style={{ background: colors[index % colors.length] }} aria-hidden="true" />
            <span>
              {c.label} · {(c.weight * 100).toFixed(0)}%
            </span>
            <strong>{c.value.toFixed(3)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function VisualizationReport({
  optimize = null,
  profile = null,
  cleaning = null,
  sourceName,
  onClose,
}: VisualizationReportProps) {
  const story = useMemo(
    () => buildStoryReport({ optimize, profile, cleaning, sourceName }),
    [optimize, profile, cleaning, sourceName]
  )

  const scoreboardBars =
    story.selection?.scoreboard.map((row) => ({
      label: row.name.replace(/_/g, " "),
      value: row.sei,
      highlight: row.name === story.selection?.formation,
    })) || []

  const issueBars = story.problem.topIssues.map((issue) => ({
    label: issue.label,
    value: issue.pct,
    highlight: issue.severity === "Critical" || issue.severity === "High",
  }))

  const terrainBars = story.problem.terrainMetrics
    .filter((m) => m.label !== "n rows" && m.label !== "n cols")
    .map((m) => ({
      label: m.label,
      value: m.value <= 1 ? m.value * 100 : Math.min(m.value, 100),
    }))

  return (
    <div className="viz-report" role="region" aria-labelledby="viz-title">
      <header className="viz-hero">
        <button type="button" className="back-button" onClick={onClose}>
          ← Back to results
        </button>
        <p className="eyebrow">Visualize · storytelling report</p>
        <h1 id="viz-title">{story.title}</h1>
        <p className="viz-subtitle">{story.subtitle}</p>
        <ol className="viz-phase-rail" aria-label="Paper phases">
          {(story.verification?.phases || ["Understand the data", "Compare the options", "Double-check the result"]).map(
            (phase, index) => (
              <li key={phase}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {phase}
              </li>
            )
          )}
        </ol>
      </header>

      <section className="viz-act" aria-labelledby="act-problem">
        <div className="viz-act-label">Act 01</div>
        <h2 id="act-problem">The problem</h2>
        <p className="viz-lead">{story.problem.statement}</p>
        <p>{story.problem.message}</p>

        <div className="viz-grid-2">
          <div className="viz-panel">
            <h3>What the dataset is saying</h3>
            {story.problem.qualityScore != null && (
              <div className="viz-quality">
                <strong>{story.problem.qualityScore}</strong>
                <div>
                  <span>Quality score</span>
                  <small>{story.problem.qualityLabel}</small>
                </div>
              </div>
            )}
            {story.problem.terrainTags.length > 0 && (
              <div className="viz-tags">
                {story.problem.terrainTags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            {issueBars.length > 0 ? (
              <>
                <p className="viz-caption">Priority issues by % of records affected</p>
                <BarChart items={issueBars} max={100} valueFormat={(v) => `${v.toFixed(1)}%`} />
              </>
            ) : (
              <p className="viz-caption">No profile issues listed — terrain and SEI carry the story.</p>
            )}
          </div>
          <div className="viz-panel">
            <h3>Terrain signals (Algorithm 1 inputs)</h3>
            {terrainBars.length ? (
              <>
                <BarChart items={terrainBars} max={100} valueFormat={(v) => v.toFixed(1)} />
                <ul className="viz-hint-list">
                  {story.problem.terrainMetrics.slice(0, 4).map((m) => (
                    <li key={m.label}>
                      <strong>{m.label}</strong>
                      <span>{m.hint}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="viz-caption">
                Terrain metrics appear after strategy comparison. Cleaning-only views still surface quality and issues above.
              </p>
            )}
          </div>
        </div>
      </section>

      {story.changes && (
        <section className="viz-act" aria-labelledby="act-changes">
          <div className="viz-act-label">Act 02 · optional</div>
          <h2 id="act-changes">What changed in the file</h2>
          <p className="viz-lead">{story.changes.summary}</p>
          <dl className="viz-metric-row">
            {story.changes.metrics.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
          {story.changes.steps.length > 0 && (
            <ol className="viz-step-chips">
              {story.changes.steps.slice(0, 8).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="viz-act" aria-labelledby="act-strategy">
        <div className="viz-act-label">Act {story.changes ? "03" : "02"}</div>
        <h2 id="act-strategy">Why this model / formation was selected</h2>
        {story.selection ? (
          <>
            <p className="viz-lead">
              Recommended preparation: <strong>{story.selection.formation.replace(/_/g, " ")}</strong>
              {story.selection.sei != null ? ` · SEI ${story.selection.sei.toFixed(3)}` : ""}.
              Cold-start from terrain: {story.selection.coldStart.replace(/_/g, " ")}.
            </p>
            <p>{story.selection.reason}</p>
            <p className="viz-caption">
              Paper terrain fit: {story.selection.paperTerrain}. SEI ={" "}
              {(SEI_WEIGHTS.accuracy * 100).toFixed(0)}% accuracy +{" "}
              {(SEI_WEIGHTS.stability * 100).toFixed(0)}% stability +{" "}
              {(SEI_WEIGHTS.retention * 100).toFixed(0)}% retention +{" "}
              {(SEI_WEIGHTS.simplicity * 100).toFixed(0)}% simplicity.
            </p>

            <div className="viz-grid-2">
              <div className="viz-panel">
                <h3>Formation scoreboard</h3>
                <BarChart items={scoreboardBars} />
              </div>
              <div className="viz-panel">
                <h3>SEI components for the winner</h3>
                {story.selection.components.length ? (
                  <ComponentRing components={story.selection.components} />
                ) : (
                  <p className="viz-caption">Component scores unavailable for this run.</p>
                )}
              </div>
            </div>

            <div className="viz-panel viz-techniques">
              <h3>Techniques inside the selected formation (Table 1)</h3>
              <ul>
                {story.selection.techniques.map((tech) => (
                  <li key={tech}>{tech}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="viz-panel">
            <p className="viz-lead">Strategy comparison has not been run yet.</p>
            <p>
              Cleaning alone improves trust in the file. To see why a specific formation wins — with SEI charts
              aligned to the research paper — choose a category column and run <strong>Compare options</strong>.
            </p>
          </div>
        )}
      </section>

      {story.verification && story.selection && (
        <section className="viz-act" aria-labelledby="act-verify">
          <div className="viz-act-label">Act 04</div>
          <h2 id="act-verify">Double-check · fair benchmark</h2>
          <div className="viz-benchmark">
            <div>
              <span>SOFIDR</span>
              <strong>{story.verification.sofidrSei?.toFixed(4) ?? "—"}</strong>
            </div>
            <div>
              <span>{story.verification.conventionalLabel || "Conventional"}</span>
              <strong>{story.verification.conventionalSei?.toFixed(4) ?? "—"}</strong>
            </div>
            <div>
              <span>Δ SEI</span>
              <strong>
                {story.verification.deltaSei == null
                  ? "—"
                  : `${story.verification.deltaSei >= 0 ? "+" : ""}${story.verification.deltaSei.toFixed(4)}`}
              </strong>
            </div>
          </div>
          <p>
            Winner under the paper’s comparison framing:{" "}
            <strong>{story.verification.winner.replace(/_/g, " ")}</strong>.
          </p>
        </section>
      )}

      <section className="viz-act" aria-labelledby="act-insights">
        <div className="viz-act-label">Conclusions</div>
        <h2 id="act-insights">Significant insights for a business decision</h2>
        <p className="viz-lead">
          These conclusions are derived from the scan, the SEI scoreboard, and the paper’s selection logic —
          not generic boilerplate.
        </p>
        <ol className="viz-insights">
          {story.insights.map((insight) => (
            <li key={insight.title} className={`impact-${insight.impact}`}>
              <div>
                <span className="viz-impact">{insight.impact}</span>
                <h3>{insight.title}</h3>
              </div>
              <p>{insight.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="viz-act" aria-labelledby="act-actions">
        <div className="viz-act-label">Next moves</div>
        <h2 id="act-actions">Action items</h2>
        <ol className="viz-actions">
          {story.actions.map((action, index) => (
            <li key={action.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{action.title}</h3>
                <p>{action.detail}</p>
                <small>Owner: {action.owner}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {story.narrative && (
        <section className="viz-act viz-narrative" aria-labelledby="act-narrative">
          <h2 id="act-narrative">Full analytical narrative</h2>
          <pre>{story.narrative}</pre>
        </section>
      )}

      <section className="viz-act viz-share-footer">
        <ShareSummary
          sourceName={sourceName || optimize?.dataset_name || "Dataset"}
          cleaning={cleaning}
          optimize={optimize}
        />
        <div className="viz-footer-actions">
          <Button onClick={onClose}>Back to results</Button>
          <Button
            variant="secondary"
            onClick={() => window.print()}
          >
            Print / save as PDF
          </Button>
        </div>
      </section>
    </div>
  )
}
