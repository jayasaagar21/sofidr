import React, { useEffect, useMemo, useState } from "react"
import {
  api,
  CleanResponse,
  DataExportFormat,
  DatasetProfile,
  OptimizeResponse,
} from "../api"
import { buildStoryReport } from "../lib/storyReport"
import { downloadWordReport, printReportAsPdf } from "../lib/reportExport"
import { buildAnalyticsFromCsv, DatasetAnalytics } from "../lib/datasetAnalytics"
import { Button } from "./ui/Button"
import InfoButton from "./InfoButton"

export type WorkspacePage = "dataset" | "visualize" | "report"

interface ResultsWorkspaceProps {
  page: WorkspacePage
  onPageChange: (page: WorkspacePage) => void
  cleaning: CleanResponse | null
  profile: DatasetProfile | null
  optimize: OptimizeResponse | null
  sourceFile: File | null
  sourceName: string
  scanLog: string[]
  onBack: () => void
  onReset: () => void
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
  if (!items.length) {
    return <p className="journey-caption">No chart data for this view yet.</p>
  }
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

const VIZ_LOAD_STEPS = [
  "Analyzing the dataset…",
  "Understanding numeric relationships…",
  "Inputting cleaned fields for charts…",
  "Selecting the best visualization strategy…",
  "Rendering insights…",
]

const REPORT_LOAD_STEPS = [
  "Gathering dataset judgments…",
  "Folding in visualization findings…",
  "Writing conclusions…",
  "Preparing downloadable report…",
]

function StageReveal({
  title,
  steps,
  onDone,
  durationMs = 5000,
}: {
  title: string
  steps: string[]
  onDone: () => void
  durationMs?: number
}) {
  const [index, setIndex] = useState(0)
  const doneRef = React.useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const stepMs = durationMs / steps.length
    const timers = steps.map((_, i) =>
      window.setTimeout(() => setIndex(i), Math.round(stepMs * i))
    )
    const done = window.setTimeout(() => doneRef.current(), durationMs)
    return () => {
      timers.forEach(window.clearTimeout)
      window.clearTimeout(done)
    }
  }, [steps, durationMs])

  const pct = Math.round(((index + 1) / steps.length) * 100)

  return (
    <div className="page-reveal" role="status" aria-live="polite">
      <span className="progress-pulse" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{steps[index]}</p>
      <div className="process-page-bar-track">
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol className="process-live-steps" style={{ marginTop: "1.25rem", width: "100%" }}>
        {steps.map((step, i) => (
          <li
            key={step}
            className={i < index ? "is-done" : i === index ? "is-active" : "is-pending"}
          >
            <span className="process-live-marker" aria-hidden="true">
              {i < index ? "✓" : i + 1}
            </span>
            <div>
              <strong>{step}</strong>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Heatmap({
  labels,
  matrix,
}: {
  labels: string[]
  matrix: number[][]
}) {
  if (!labels.length) return <p className="journey-caption">Need 2+ numeric columns for a heatmap.</p>
  const size = labels.length
  const cell = Math.max(28, Math.min(48, Math.floor(320 / size)))
  return (
    <div className="heatmap-wrap">
      <div
        className="heatmap"
        style={{
          gridTemplateColumns: `auto repeat(${size}, ${cell}px)`,
        }}
      >
        <span />
        {labels.map((label) => (
          <span key={`h-${label}`} className="heatmap-col-label" title={label}>
            {label.slice(0, 8)}
          </span>
        ))}
        {labels.map((rowLabel, i) => (
          <React.Fragment key={`r-${rowLabel}`}>
            <span className="heatmap-row-label" title={rowLabel}>
              {rowLabel.slice(0, 12)}
            </span>
            {labels.map((colLabel, j) => {
              const value = matrix[i]?.[j] ?? 0
              const intensity = Math.min(1, Math.abs(value))
              const hue = value >= 0 ? 95 : 8
              return (
                <span
                  key={`${rowLabel}-${colLabel}`}
                  className="heatmap-cell"
                  title={`${rowLabel} × ${colLabel}: ${value.toFixed(2)}`}
                  style={{
                    width: cell,
                    height: cell,
                    background: `hsla(${hue}, 70%, ${72 - intensity * 40}%, ${0.25 + intensity * 0.7})`,
                  }}
                />
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <p className="journey-caption">Correlation heatmap (−1 to 1). Brighter cells = stronger link.</p>
    </div>
  )
}

export default function ResultsWorkspace({
  page,
  onPageChange,
  cleaning,
  profile,
  optimize,
  sourceFile,
  sourceName,
  scanLog,
  onBack,
  onReset,
}: ResultsWorkspaceProps) {
  const [showSteps, setShowSteps] = useState(false)
  const [exportLoading, setExportLoading] = useState<DataExportFormat | null>(null)
  const [exportError, setExportError] = useState("")
  const [vizReady, setVizReady] = useState(false)
  const [reportReady, setReportReady] = useState(false)
  const [analytics, setAnalytics] = useState<DatasetAnalytics | null>(null)

  useEffect(() => {
    if (page === "visualize") setVizReady(false)
    if (page === "report") setReportReady(false)
    window.scrollTo({ top: 0, behavior: "auto" })
  }, [page])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!cleaning?.blob) {
        setAnalytics(null)
        return
      }
      try {
        const text = await cleaning.blob.slice(0, 2 * 1024 * 1024).text()
        if (!cancelled) setAnalytics(buildAnalyticsFromCsv(text))
      } catch {
        if (!cancelled) setAnalytics(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [cleaning])

  const story = useMemo(
    () => buildStoryReport({ optimize, profile, cleaning, sourceName }),
    [optimize, profile, cleaning, sourceName]
  )

  const isLocal = cleaning?.metadata.processingMode === "local"
  const m = cleaning?.metadata
  const preview = cleaning?.preview

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

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

  const qualityBars = profile
    ? Object.entries(profile.quality.dimensions).map(([label, value]) => ({
        label: label.replace(/_/g, " "),
        value: Number(value),
      }))
    : []

  const backLabel =
    page === "dataset" ? "← Back to start" : page === "visualize" ? "← Dataset" : "← Visualization"

  const handleBack = () => {
    if (page === "dataset") onBack()
    else if (page === "visualize") onPageChange("dataset")
    else onPageChange("visualize")
  }

  return (
    <div className="workspace">
      <header className="workspace-bar">
        <button type="button" className="back-button" onClick={handleBack}>
          {backLabel}
        </button>
        <nav className="workspace-pages" aria-label="Result pages">
          <button
            type="button"
            className={page === "dataset" ? "is-current" : ""}
            onClick={() => onPageChange("dataset")}
          >
            Dataset
          </button>
          <button
            type="button"
            className={page === "visualize" ? "is-current" : ""}
            onClick={() => onPageChange("visualize")}
          >
            Visualization
          </button>
          <button
            type="button"
            className={page === "report" ? "is-current" : ""}
            onClick={() => onPageChange("report")}
          >
            Report
          </button>
        </nav>
        <button type="button" className="workspace-new" onClick={onReset}>
          New file
        </button>
      </header>

      {page === "dataset" && (
        <section className="workspace-page" aria-labelledby="ws-dataset">
          <div className="results-section-head">
            <div>
              <p className="eyebrow">Page 1 · Dataset</p>
              <h1 id="ws-dataset">{sourceName}</h1>
            </div>
            <InfoButton title="How we handled your dataset">
              <p>
                <strong>What we received:</strong> your file for this session only.
              </p>
              <p>
                <strong>How we decided what to fix:</strong> blanks, duplicates, and messy common
                fields ranked by how many rows they affect.
              </p>
              <p>
                <strong>Cleaning:</strong> remove exact duplicates, fill empty cells, standardize
                frequent fields, then prepare a downloadable preview.
              </p>
            </InfoButton>
          </div>

          <p className="results-section-lead">
            Scan complete. Preview the first 10 cleaned rows, download the file, then continue to
            visualization.
          </p>

          {(m?.datasetJudgment || story.problem.message) && (
            <div className="journey-approach-body">
              <h3>Dataset judgment</h3>
              <p>{m?.datasetJudgment || story.problem.message}</p>
            </div>
          )}

          {!!m?.tactics?.length && (
            <div className="tactics-list">
              <h3>Tactics applied</h3>
              <ul>
                {m.tactics.slice(0, 8).map((tactic) => (
                  <li key={`${tactic.tactic}-${tactic.column}`}>
                    <strong>{tactic.tactic}</strong>
                    <span>
                      {tactic.column !== "(all)" && tactic.column !== "(missing cells)"
                        ? `${tactic.column} · `
                        : ""}
                      {tactic.why}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details
            className="scan-log"
            open={showSteps}
            onToggle={(e) => setShowSteps((e.target as HTMLDetailsElement).open)}
          >
            <summary>
              {showSteps ? "Hide analysis steps" : "Show analysis steps"}
              <small>{scanLog.length ? `${scanLog.length} steps` : "optional"}</small>
            </summary>
            <ol>
              {(scanLog.length
                ? scanLog
                : m?.steps?.map((s) => s.replace(/_/g, " ")) || [
                    "File added",
                    "Understand dataset",
                    "Apply tactics",
                    "Preview prepared",
                  ]
              ).map((step, index) => (
                <li key={`${step}-${index}`}>{step}</li>
              ))}
            </ol>
          </details>

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

          <div className="journey-download-row">
            {cleaning ? (
              <>
                <Button onClick={() => download("csv")} disabled={exportLoading !== null}>
                  {exportLoading === "csv" ? "Preparing…" : "Download cleaned data"}
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
              <p className="journey-caption">Example run — continue to Visualization.</p>
            )}
          </div>
          {exportError && <p className="report-export-error" role="alert">{exportError}</p>}

          {preview && preview.columns.length > 0 && (
            <div className="journey-preview">
              <div className="preview-heading">
                <h3>Preview</h3>
                <span>First {preview.rows.length} of cleaned rows</span>
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

          <div className="journey-nav">
            <Button onClick={() => onPageChange("visualize")}>
              Continue to Visualization <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}

      {page === "visualize" && (
        <section className="workspace-page" aria-labelledby="ws-viz">
          {!vizReady ? (
            <StageReveal
              title="Building visualization"
              steps={VIZ_LOAD_STEPS as unknown as string[]}
              onDone={() => setVizReady(true)}
            />
          ) : (
            <>
              <div className="results-section-head">
                <div>
                  <p className="eyebrow">Page 2 · Visualization</p>
                  <h1 id="ws-viz">See how your dataset looks visually</h1>
                </div>
                <InfoButton title="How we choose these charts">
                  <p>
                    After cleaning, we inspect numeric relationships (correlation heatmap), skew,
                    IQR outliers, and strong “neighbor” pairs — plus issue and quality views — so
                    you can judge the data before the report.
                  </p>
                </InfoButton>
              </div>
              <p className="results-section-lead">
                Heatmap, correlations, skew, outliers, and neighbors from the cleaned file.
              </p>

              <div className="viz-panel">
                <h3>Correlation heatmap</h3>
                <Heatmap
                  labels={analytics?.corrLabels || []}
                  matrix={analytics?.correlationMatrix || []}
                />
              </div>

              <div className="viz-grid-2">
                <div className="viz-panel">
                  <h3>Strong neighbors (similar movers)</h3>
                  <BarChart
                    items={(analytics?.neighbors || []).map((p) => ({
                      label: `${p.left} ↔ ${p.right}`,
                      value: Math.abs(p.value),
                      highlight: Math.abs(p.value) >= 0.7,
                    }))}
                    max={1}
                    valueFormat={(v) => v.toFixed(2)}
                  />
                </div>
                <div className="viz-panel">
                  <h3>Skew ratios</h3>
                  <BarChart
                    items={(analytics?.skew || []).slice(0, 8).map((s) => ({
                      label: s.column,
                      value: Math.abs(s.skew),
                      highlight: Math.abs(s.skew) >= 1,
                    }))}
                    valueFormat={(v) => v.toFixed(2)}
                  />
                  <p className="journey-caption">Higher bars = more asymmetric distributions.</p>
                </div>
              </div>

              <div className="viz-grid-2">
                <div className="viz-panel">
                  <h3>Outliers (IQR canyons)</h3>
                  <BarChart
                    items={(analytics?.outliers || []).slice(0, 8).map((o) => ({
                      label: o.column,
                      value: o.count,
                      highlight: o.pct >= 5,
                    }))}
                    valueFormat={(v) => String(Math.round(v))}
                  />
                  <p className="journey-caption">Count of points beyond 1.5× IQR fences.</p>
                </div>
                <div className="viz-panel">
                  <h3>Where attention is needed</h3>
                  <BarChart items={issueBars} max={100} valueFormat={(v) => `${v.toFixed(1)}%`} />
                </div>
              </div>

              <div className="viz-panel">
                <h3>{scoreboardBars.length ? "Preparation scores" : "Quality view"}</h3>
                <BarChart
                  items={scoreboardBars.length ? scoreboardBars : qualityBars}
                  max={scoreboardBars.length ? undefined : 100}
                  valueFormat={(v) => (scoreboardBars.length ? v.toFixed(3) : v.toFixed(1))}
                />
              </div>

              <div className="journey-nav">
                <Button variant="secondary" onClick={() => onPageChange("dataset")}>
                  ← Dataset
                </Button>
                <Button onClick={() => onPageChange("report")}>
                  Continue to Report <span aria-hidden="true">→</span>
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {page === "report" && (
        <section className="workspace-page" aria-labelledby="ws-report">
          {!reportReady ? (
            <StageReveal
              title="Generating report"
              steps={REPORT_LOAD_STEPS as unknown as string[]}
              onDone={() => setReportReady(true)}
              durationMs={4200}
            />
          ) : (
            <>
              <div className="results-section-head">
                <div>
                  <p className="eyebrow">Page 3 · Report</p>
                  <h1 id="ws-report">Insight report</h1>
                </div>
                <InfoButton title="How the report is built">
                  <p>
                    Built from the cleaned dataset and the charts. Word is best for editing; PDF
                    via your print dialog for a fixed handout.
                  </p>
                </InfoButton>
              </div>
              <p className="results-section-lead">
                A concise summary — no raw table dump. Download Word to edit, or save as PDF.
              </p>

              <article className="report-preview">
                <h3>Insight report</h3>
                <p className="report-kicker">{sourceName}</p>
                <h4>Problem</h4>
                <p>{story.problem.statement}</p>
                <p>{story.problem.message}</p>
                {story.selection && (
                  <>
                    <h4>Approach we recommend</h4>
                    <p>
                      <strong>{story.selection.formation.replace(/_/g, " ")}</strong>
                      {story.selection.sei != null
                        ? ` · score ${story.selection.sei.toFixed(3)}`
                        : ""}
                      . {story.selection.reason}
                    </p>
                  </>
                )}
                <h4>Key insights</h4>
                <ol className="report-insight-list">
                  {story.insights.map((insight) => (
                    <li key={insight.title}>
                      <strong>{insight.title}</strong>
                      <span>{insight.detail}</span>
                    </li>
                  ))}
                  {analytics?.neighbors?.[0] && (
                    <li>
                      <strong>Strongest numeric neighbors</strong>
                      <span>
                        {analytics.neighbors[0].left} and {analytics.neighbors[0].right} move
                        together (|r|={Math.abs(analytics.neighbors[0].value).toFixed(2)}). Treat
                        them as one story when briefing stakeholders.
                      </span>
                    </li>
                  )}
                  {analytics?.skew?.[0] && Math.abs(analytics.skew[0].skew) >= 1 && (
                    <li>
                      <strong>Skewed field to watch</strong>
                      <span>
                        {analytics.skew[0].column} is highly skewed (skew=
                        {analytics.skew[0].skew}). Medians and robust prep beat raw averages here.
                      </span>
                    </li>
                  )}
                  {analytics?.outliers?.[0] && (
                    <li>
                      <strong>Outlier canyon</strong>
                      <span>
                        {analytics.outliers[0].column} has {analytics.outliers[0].count} IQR
                        outliers ({analytics.outliers[0].pct}%). Review before locking KPIs.
                      </span>
                    </li>
                  )}
                </ol>
                <h4>Next actions</h4>
                <ol className="report-insight-list">
                  {story.actions.map((action) => (
                    <li key={action.title}>
                      <strong>{action.title}</strong>
                      <span>
                        {action.detail} · {action.owner}
                      </span>
                    </li>
                  ))}
                </ol>
              </article>

              <div className="journey-download-row">
                <Button onClick={() => downloadWordReport(story, sourceName)}>
                  Download Word (editable)
                </Button>
                <Button variant="secondary" onClick={() => printReportAsPdf(story, sourceName)}>
                  Save as PDF / Print
                </Button>
              </div>

              <div className="journey-nav">
                <Button variant="secondary" onClick={() => onPageChange("visualize")}>
                  ← Visualization
                </Button>
                <Button onClick={onReset}>Try a new file</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
