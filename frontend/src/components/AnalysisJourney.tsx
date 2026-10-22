import React, { useMemo, useState } from "react"
import {
  api,
  CleanResponse,
  DataExportFormat,
  DatasetProfile,
  OptimizeResponse,
} from "../api"
import { buildStoryReport, SEI_WEIGHTS } from "../lib/storyReport"
import { Button } from "./ui/Button"
import ShareSummary from "./ShareSummary"

type JourneyStep = 1 | 2 | 3

interface AnalysisJourneyProps {
  cleaning: CleanResponse | null
  profile: DatasetProfile | null
  optimize: OptimizeResponse | null
  sourceFile: File | null
  sourceName: string
  onReset: () => void
  onRunStrategy?: (targetColumn: string) => void
  strategyLoading?: boolean
  strategyError?: string
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
  if (!items.length) return <p className="journey-empty">No chart data for this step yet.</p>
  const ceiling = max ?? Math.max(...items.map((i) => i.value), 0.001)
  return (
    <ul className="viz-bars" aria-label="Chart">
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

const STEPS = [
  { id: 1 as const, label: "Dataset", detail: "Preview & download" },
  { id: 2 as const, label: "Visualization", detail: "See the patterns" },
  { id: 3 as const, label: "Report", detail: "Insights & actions" },
]

export default function AnalysisJourney({
  cleaning,
  profile,
  optimize,
  sourceFile,
  sourceName,
  onReset,
  onRunStrategy,
  strategyLoading = false,
  strategyError = "",
}: AnalysisJourneyProps) {
  const [step, setStep] = useState<JourneyStep>(1)
  const [maxReached, setMaxReached] = useState<JourneyStep>(1)
  const [showApproach, setShowApproach] = useState(false)
  const [exportLoading, setExportLoading] = useState<DataExportFormat | null>(null)
  const [exportError, setExportError] = useState("")
  const [targetColumn, setTargetColumn] = useState("")

  const story = useMemo(
    () => buildStoryReport({ optimize, profile, cleaning, sourceName }),
    [optimize, profile, cleaning, sourceName]
  )

  const targetOptions = useMemo(() => {
    if (!profile || !onRunStrategy) return []
    const byName = new Map(profile.columns.map((column) => [column.name, column]))
    return profile.dataset.potential_target_fields
      .map((name) => byName.get(name))
      .filter((column): column is NonNullable<typeof column> =>
        Boolean(column && column.n_missing === 0 && column.n_unique >= 2)
      )
  }, [profile, onRunStrategy])

  const goTo = (next: JourneyStep) => {
    setStep(next)
    setMaxReached((prev) => (next > prev ? next : prev))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const isLocal = cleaning?.metadata.processingMode === "local"

  const download = async (format: DataExportFormat) => {
    if (!cleaning) return
    if (!sourceFile) {
      if (format === "csv") downloadBlob(cleaning.blob, cleaning.metadata.filename)
      return
    }
    setExportLoading(format)
    setExportError("")
    try {
      if (format === "csv" && cleaning.metadata.exportFormat === "csv") {
        downloadBlob(cleaning.blob, cleaning.metadata.filename)
        return
      }
      if (isLocal) {
        setExportError("Large-file cleans export as CSV from your browser.")
        return
      }
      const exported = await api.clean(sourceFile, format)
      downloadBlob(exported.blob, exported.metadata.filename)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExportLoading(null)
    }
  }

  const issueBars = story.problem.topIssues.map((issue) => ({
    label: issue.label,
    value: issue.pct,
    highlight: issue.severity === "Critical" || issue.severity === "High",
  }))

  const scoreboardBars =
    story.selection?.scoreboard.map((row) => ({
      label: row.name.replace(/_/g, " "),
      value: row.sei,
      highlight: row.name === story.selection?.formation,
    })) || []

  const componentBars =
    story.selection?.components.map((c) => ({
      label: `${c.label} (${(c.weight * 100).toFixed(0)}%)`,
      value: c.value,
      highlight: c.key === "accuracy",
    })) || []

  const preview = cleaning?.preview
  const m = cleaning?.metadata

  return (
    <div className="analysis-journey">
      <button type="button" className="back-button" onClick={onReset}>
        ← Start over
      </button>

      <header className="journey-header">
        <p className="eyebrow">Your analysis</p>
        <h1>{sourceName}</h1>
        <p className="journey-tagline">
          Three simple steps. Dataset first, then charts, then the insight report.
        </p>
      </header>

      <nav className="journey-steps" aria-label="Analysis steps">
        {STEPS.map((item) => {
          const reached = item.id <= maxReached
          const current = item.id === step
          return (
            <button
              key={item.id}
              type="button"
              className={`journey-step ${current ? "is-current" : ""} ${reached ? "is-reached" : ""}`}
              onClick={() => reached && goTo(item.id)}
              disabled={!reached}
              aria-current={current ? "step" : undefined}
            >
              <span className="journey-step-num">{item.id}</span>
              <span className="journey-step-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </button>
          )
        })}
      </nav>

      {step === 1 && (
        <section className="journey-panel" aria-labelledby="step1-title">
          <h2 id="step1-title">Step 1 · Dataset</h2>
          <p className="journey-lead">
            Your cleaned file is ready. Preview it below, download it, then continue when you want
            charts and insights.
          </p>

          {m && (
            <dl className="journey-metrics">
              <div>
                <dt>Rows</dt>
                <dd>
                  {(m.before.rows ?? 0).toLocaleString()} → {(m.after.rows ?? 0).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Duplicates removed</dt>
                <dd>{m.duplicatesRemoved.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Blanks filled</dt>
                <dd>{m.missingFilled.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Completeness</dt>
                <dd>
                  {m.completenessBefore ?? "—"}% → {m.completenessAfter ?? "—"}%
                </dd>
              </div>
            </dl>
          )}

          {!cleaning && optimize && (
            <p className="journey-lead">
              Example run for <strong>{optimize.dataset_name}</strong>
              {optimize.target_column ? ` · predicting “${optimize.target_column}”` : ""}.
              Continue to Visualization to see how the six formations compared.
            </p>
          )}

          <div className="journey-download-row">
            {cleaning ? (
              <>
                <Button onClick={() => download("csv")} disabled={exportLoading !== null}>
                  {exportLoading === "csv" ? "Preparing…" : "Download cleaned CSV"}
                </Button>
                {!isLocal && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => download("xlsx")}
                      disabled={exportLoading !== null}
                    >
                      Excel
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => download("json")}
                      disabled={exportLoading !== null}
                    >
                      JSON
                    </Button>
                  </>
                )}
              </>
            ) : (
              <p className="journey-caption">This example has no file download — focus on steps 2 and 3.</p>
            )}
          </div>
          {exportError && <p className="report-export-error" role="alert">{exportError}</p>}

          {preview && preview.columns.length > 0 && (
            <div className="journey-preview">
              <div className="preview-heading">
                <h3>Preview</h3>
                <span>First {preview.rows.length} rows of the cleaned dataset</span>
              </div>
              <div className="table-container">
                <table>
                  <caption className="sr-only">Cleaned dataset preview</caption>
                  <thead>
                    <tr>
                      {preview.columns.map((column, index) => (
                        <th key={`${column}-${index}`} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {preview.columns.map((_, columnIndex) => (
                          <td key={columnIndex}>{row[columnIndex] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="journey-approach">
            <Button variant="secondary" onClick={() => setShowApproach((v) => !v)}>
              {showApproach ? "Hide approach summary" : "Explain the approach"}
            </Button>
            {showApproach && (
              <div className="journey-approach-body" role="region" aria-label="Approach summary">
                <h3>How SOFIDR handled this file</h3>
                <p>{story.problem.statement}</p>
                <p>{story.problem.message}</p>
                {m?.steps?.length ? (
                  <ol>
                    {m.steps.map((stepName) => (
                      <li key={stepName}>{stepName.replace(/_/g, " ")}</li>
                    ))}
                  </ol>
                ) : null}
                {story.selection && (
                  <p>
                    Recommended preparation after comparison:{" "}
                    <strong>{story.selection.formation.replace(/_/g, " ")}</strong> (SEI{" "}
                    {story.selection.sei?.toFixed(3) ?? "—"}) — paper terrain:{" "}
                    {story.selection.paperTerrain}.
                  </p>
                )}
                <p className="journey-caption">
                  Session only — nothing is stored after you leave.
                </p>
              </div>
            )}
          </div>

          {onRunStrategy && targetOptions.length > 0 && (
            <details className="journey-optional">
              <summary>Optional: compare preparation strategies</summary>
              <p>
                If you have a category to predict, SOFIDR can compare six paper formations and
                enrich Visualization + Report.
              </p>
              <label htmlFor="journey-target">Category column</label>
              <select
                id="journey-target"
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
              >
                <option value="">Choose a column</option>
                {targetOptions.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name} · {column.n_unique} classes
                  </option>
                ))}
              </select>
              <Button
                onClick={() => targetColumn && onRunStrategy(targetColumn)}
                disabled={!targetColumn || strategyLoading}
              >
                {strategyLoading ? "Comparing…" : "Compare options"}
              </Button>
              {strategyError && <p className="report-export-error" role="alert">{strategyError}</p>}
            </details>
          )}

          <div className="journey-nav">
            <Button onClick={() => goTo(2)}>
              Continue to Visualization <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="journey-panel" aria-labelledby="step2-title">
          <h2 id="step2-title">Step 2 · Visualization</h2>
          <p className="journey-lead">
            Charts that show what matters in this dataset — issues, terrain, and (when available)
            how the six formations scored.
          </p>

          <div className="viz-grid-2">
            <div className="viz-panel">
              <h3>Priority issues</h3>
              <p className="viz-caption">Share of records affected</p>
              <BarChart items={issueBars} max={100} valueFormat={(v) => `${v.toFixed(1)}%`} />
            </div>
            <div className="viz-panel">
              <h3>
                {scoreboardBars.length ? "Formation scoreboard (SEI)" : "Quality snapshot"}
              </h3>
              {scoreboardBars.length ? (
                <>
                  <p className="viz-caption">
                    Higher SEI is better · weights: accuracy {(SEI_WEIGHTS.accuracy * 100) | 0}% ·
                    stability {(SEI_WEIGHTS.stability * 100) | 0}% · retention{" "}
                    {(SEI_WEIGHTS.retention * 100) | 0}% · simplicity{" "}
                    {(SEI_WEIGHTS.simplicity * 100) | 0}%
                  </p>
                  <BarChart items={scoreboardBars} />
                </>
              ) : (
                <>
                  <p className="viz-caption">
                    Quality score: {story.problem.qualityScore ?? "—"} (
                    {story.problem.qualityLabel || "n/a"})
                  </p>
                  <BarChart
                    items={
                      profile
                        ? Object.entries(profile.quality.dimensions).map(([label, value]) => ({
                            label: label.replace(/_/g, " "),
                            value: Number(value),
                          }))
                        : []
                    }
                    max={100}
                    valueFormat={(v) => v.toFixed(1)}
                  />
                </>
              )}
            </div>
          </div>

          {componentBars.length > 0 && (
            <div className="viz-panel" style={{ marginTop: "1rem" }}>
              <h3>Why the winner looks strong — SEI components</h3>
              <BarChart items={componentBars} />
            </div>
          )}

          {story.selection && (
            <p className="journey-caption" style={{ marginTop: "1rem" }}>
              Selected: <strong>{story.selection.formation.replace(/_/g, " ")}</strong> · cold-start
              was {story.selection.coldStart.replace(/_/g, " ")} · {story.selection.paperTerrain}
            </p>
          )}

          <div className="journey-nav">
            <Button variant="secondary" onClick={() => goTo(1)}>
              ← Dataset
            </Button>
            <Button onClick={() => goTo(3)}>
              Continue to Report <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="journey-panel journey-report" aria-labelledby="step3-title">
          <h2 id="step3-title">Step 3 · Report</h2>
          <p className="journey-lead">
            A research-style summary from steps 1 and 2 — important insights only. No raw table dump.
          </p>

          <article className="report-block">
            <h3>Executive summary</h3>
            <p>{story.problem.statement}</p>
            <p>{story.problem.message}</p>
          </article>

          {story.selection && (
            <article className="report-block">
              <h3>Method selected</h3>
              <p>
                <strong>{story.selection.formation.replace(/_/g, " ")}</strong> won on Strategic
                Efficiency Index
                {story.selection.sei != null ? ` (${story.selection.sei.toFixed(3)})` : ""}.{" "}
                {story.selection.reason}
              </p>
              <p className="journey-caption">
                Paper terrain: {story.selection.paperTerrain}. Techniques:{" "}
                {story.selection.techniques.slice(0, 5).join("; ")}.
              </p>
            </article>
          )}

          <article className="report-block">
            <h3>Highlight charts</h3>
            <div className="viz-grid-2">
              <div>
                <p className="viz-caption">Issues</p>
                <BarChart items={issueBars.slice(0, 5)} max={100} valueFormat={(v) => `${v.toFixed(1)}%`} />
              </div>
              <div>
                <p className="viz-caption">
                  {scoreboardBars.length ? "Formation SEI" : "Quality dimensions"}
                </p>
                <BarChart
                  items={
                    scoreboardBars.length
                      ? scoreboardBars.slice(0, 6)
                      : profile
                        ? Object.entries(profile.quality.dimensions).map(([label, value]) => ({
                            label: label.replace(/_/g, " "),
                            value: Number(value),
                          }))
                        : []
                  }
                  max={scoreboardBars.length ? undefined : 100}
                  valueFormat={(v) => (scoreboardBars.length ? v.toFixed(3) : v.toFixed(1))}
                />
              </div>
            </div>
          </article>

          <article className="report-block">
            <h3>Key insights</h3>
            <ol className="viz-insights">
              {story.insights.map((insight) => (
                <li key={insight.title} className={`impact-${insight.impact}`}>
                  <div>
                    <span className="viz-impact">{insight.impact}</span>
                    <h4>{insight.title}</h4>
                  </div>
                  <p>{insight.detail}</p>
                </li>
              ))}
            </ol>
          </article>

          <article className="report-block">
            <h3>Recommended next actions</h3>
            <ol className="viz-actions">
              {story.actions.map((action, index) => (
                <li key={action.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{action.title}</h4>
                    <p>{action.detail}</p>
                    <small>Owner: {action.owner}</small>
                  </div>
                </li>
              ))}
            </ol>
          </article>

          <div className="report-block">
            <ShareSummary
              sourceName={sourceName}
              cleaning={cleaning}
              optimize={optimize}
            />
          </div>

          <div className="journey-nav">
            <Button variant="secondary" onClick={() => goTo(2)}>
              ← Visualization
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print / save PDF
            </Button>
            <Button onClick={onReset}>Analyze another file</Button>
          </div>
        </section>
      )}
    </div>
  )
}
