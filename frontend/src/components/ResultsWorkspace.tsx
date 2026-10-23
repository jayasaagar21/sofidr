import React, { useEffect, useMemo, useState } from "react"
import {
  api,
  CleanResponse,
  CsvPreview,
  DataExportFormat,
  DatasetProfile,
  OptimizeResponse,
} from "../api"
import { buildStoryReport } from "../lib/storyReport"
import { downloadWordReport, printReportAsPdf } from "../lib/reportExport"
import { buildAnalyticsFromCsv, DatasetAnalytics } from "../lib/datasetAnalytics"
import { buildCleaningLines } from "../lib/cleaningCatalog"
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

const MIX_COLORS = ["#c9f76f", "#8cbeff", "#ffba5c", "#ff7864", "#c99bff"]

const VIZ_LOAD_STEPS = [
  "Analyzing the cleaned dataset…",
  "Deriving numeric relationships…",
  "Building infographics…",
  "Selecting chart views…",
  "Rendering analytics…",
]

const REPORT_LOAD_STEPS = [
  "Reading Analytics findings…",
  "Translating charts into business language…",
  "Writing conclusions…",
  "Preparing downloadable brief…",
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

function PreviewTable({
  preview,
  caption,
}: {
  preview: CsvPreview
  caption: string
}) {
  if (!preview.columns.length) {
    return <p className="journey-caption">No rows available for this view.</p>
  }
  return (
    <div className="table-container">
      <table>
        <caption className="sr-only">{caption}</caption>
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
  const beforePreview = cleaning?.beforePreview

  const cleaningLines = useMemo(() => {
    const steps =
      m?.steps?.length
        ? m.steps
        : scanLog.length
          ? scanLog
          : ["structural_repair", "normalized_empty_sentinels", "removed_duplicate_rows"]
    return buildCleaningLines(steps, m?.tactics)
  }, [m?.steps, m?.tactics, scanLog])

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

  const analyticsInsights = useMemo(() => {
    const out: { title: string; detail: string; kind: string; metric?: string }[] = []
    if (analytics?.rowsAnalyzed) {
      out.push({
        kind: "structure",
        title: "Dataset shape",
        metric: `${analytics.rowsAnalyzed.toLocaleString()} × ${analytics.columnCount}`,
        detail: `${analytics.numericColumns.length} numeric and ${analytics.categorical.length} segment fields analyzed${
          m?.after.rows && m.after.rows > analytics.rowsAnalyzed ? " (sample of the cleaned file)" : ""
        }.`,
      })
    }
    const seg = analytics?.categorical[0]
    if (seg?.top[0]) {
      out.push({
        kind: "segment",
        title: "Dominant segment",
        metric: `${seg.top[0].pct}%`,
        detail: `"${seg.top[0].value}" leads ${seg.column} across ${seg.distinct} values${
          seg.top[0].pct >= 60 ? " — results will mostly reflect this group" : ""
        }.`,
      })
    }
    const spread = analytics?.categorical.find((c) => c !== seg && c.top[0] && c.top[0].pct < 40)
    if (spread) {
      out.push({
        kind: "segment",
        title: "Evenly spread field",
        metric: String(spread.distinct),
        detail: `${spread.column} has no dominant value (top ${spread.top[0].pct}%) — a good dimension for comparing groups.`,
      })
    }
    if (analytics?.neighbors[0]) {
      const n = analytics.neighbors[0]
      out.push({
        kind: "neighbor",
        title: "Strongest linked measures",
        metric: `|r| ${Math.abs(n.value).toFixed(2)}`,
        detail: `${n.left} and ${n.right} move together. Treat as one narrative in dashboards to avoid double-counting.`,
      })
    }
    if (analytics?.neighbors[1]) {
      const n = analytics.neighbors[1]
      out.push({
        kind: "neighbor",
        title: "Secondary co-movers",
        metric: `|r| ${Math.abs(n.value).toFixed(2)}`,
        detail: `${n.left} ↔ ${n.right}. Useful cross-check when validating the primary link.`,
      })
    }
    if (analytics?.skew[0] && Math.abs(analytics.skew[0].skew) >= 0.8) {
      const s = analytics.skew[0]
      out.push({
        kind: "skew",
        title: "Distribution skew",
        metric: s.skew.toFixed(2),
        detail: `${s.column} is skewed. Prefer medians / robust prep over means for business targets.`,
      })
    }
    if (analytics?.outliers[0]) {
      const o = analytics.outliers[0]
      out.push({
        kind: "outlier",
        title: "Outlier canyon",
        metric: `${o.pct}%`,
        detail: `${o.column}: ${o.count} IQR outliers. Review before locking SLA or forecast baselines.`,
      })
    }
    if (issueBars[0]) {
      out.push({
        kind: "quality",
        title: "Priority data-quality risk",
        metric: `${issueBars[0].value.toFixed(1)}%`,
        detail: `${issueBars[0].label} still the top residual risk after cleaning.`,
      })
    }
    if (m) {
      out.push({
        kind: "coverage",
        title: "Coverage lift",
        metric: `${m.completenessAfter ?? "—"}%`,
        detail: `Completeness ${m.completenessBefore ?? "—"}% → ${m.completenessAfter ?? "—"}% after ${m.duplicatesRemoved.toLocaleString()} duplicate drops and ${m.missingFilled.toLocaleString()} fills.`,
      })
    }
    return out.slice(0, 9)
  }, [analytics, issueBars, m])

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
    page === "dataset" ? "← Back to start" : page === "visualize" ? "← Dataset" : "← Analytics"

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
            Analytics
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
            <p className="eyebrow">Page 1 · Curated dataset</p>
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
            Profile complete. Compare the first 10 rows before vs after cleaning, export the
            curated frame, then proceed to Analytics.
          </p>

          {(m?.datasetJudgment || story.problem.message) && (
            <div className="journey-approach-body">
              <h3>Dataset judgment</h3>
              <p>{m?.datasetJudgment || story.problem.message}</p>
            </div>
          )}

          <div className="process-lines">
            <div className="preview-heading">
              <h3>Processes & cleaning steps</h3>
              <span>One line each · tap reason for why</span>
            </div>
            <ul className="process-line-list">
              {cleaningLines.map((line) => (
                <li key={line.id}>
                  <div className="process-line-main">
                    <strong>{line.process}</strong>
                    <span className="process-line-step">{line.step}</span>
                  </div>
                  <InfoButton
                    title={`Why: ${line.process}`}
                    label="Why this is required"
                    variant="why"
                  >
                    <p>
                      <strong>Process:</strong> {line.process}
                    </p>
                    <p>
                      <strong>Cleaning step:</strong> {line.step}
                    </p>
                    <p>
                      <strong>Why required:</strong> {line.reason}
                    </p>
                  </InfoButton>
                </li>
              ))}
            </ul>
          </div>

          <details
            className="scan-log"
            open={showSteps}
            onToggle={(e) => setShowSteps((e.target as HTMLDetailsElement).open)}
          >
            <summary>
              {showSteps ? "Hide run log" : "Show full run log"}
              <small>{scanLog.length ? `${scanLog.length} entries` : "optional"}</small>
            </summary>
            <ol>
              {(scanLog.length
                ? scanLog
                : m?.steps?.map((s) => s.replace(/_/g, " ")) || ["File added", "Cleaning applied"]
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
              <p className="journey-caption">Example run — continue to Analytics.</p>
            )}
          </div>
          {exportError && <p className="report-export-error" role="alert">{exportError}</p>}

          {(beforePreview?.columns.length || preview?.columns.length) ? (
            <div className="before-after-preview">
              <div className="preview-heading">
                <h3>Before vs after</h3>
                <span>First 10 rows · raw input beside cleaned output</span>
              </div>
              <div className="before-after-grid">
                <div className="before-after-pane">
                  <div className="before-after-label">
                    <strong>Before</strong>
                    <span>Source extract</span>
                  </div>
                  {beforePreview && beforePreview.columns.length > 0 ? (
                    <PreviewTable preview={beforePreview} caption="Before cleaning preview" />
                  ) : (
                    <p className="journey-caption">
                      Before preview is available for CSV/TSV uploads. After view still shows the
                      cleaned sample.
                    </p>
                  )}
                </div>
                <div className="before-after-pane is-after">
                  <div className="before-after-label">
                    <strong>After</strong>
                    <span>SOFIDR cleaned</span>
                  </div>
                  {preview && preview.columns.length > 0 ? (
                    <PreviewTable preview={preview} caption="After cleaning preview" />
                  ) : (
                    <p className="journey-caption">Cleaned preview unavailable.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="journey-nav">
            <Button onClick={() => onPageChange("visualize")}>
              Continue to Analytics <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}

      {page === "visualize" && (
        <section className="workspace-page" aria-labelledby="ws-viz">
          {!vizReady ? (
            <StageReveal
              title="Building analytics"
              steps={VIZ_LOAD_STEPS as unknown as string[]}
              onDone={() => setVizReady(true)}
            />
          ) : (
            <>
              <div className="results-section-head">
                <div>
                  <p className="eyebrow">Page 2 · Analytics</p>
                  <h1 id="ws-viz">Derived from the cleaned dataset</h1>
                </div>
                <InfoButton title="How analytics is derived">
                  <p>
                    Infographics and charts are computed from the cleaned frame: correlations,
                    neighbor pairs, skew, IQR outliers, and residual quality signals. The Report
                    page summarizes these as business insights.
                  </p>
                </InfoButton>
              </div>
              <p className="results-section-lead">
                Information derived from your cleaned data — insight cards plus exploratory charts
                for analyst review before the brief.
              </p>

              {analyticsInsights.length > 0 && (
                <div className="insight-infographics">
                  <div className="preview-heading">
                    <h3>Derived insights</h3>
                    <span>From cleaned numeric & quality signals</span>
                  </div>
                  <ul className="insight-card-grid">
                    {analyticsInsights.map((insight) => (
                      <li key={`${insight.kind}-${insight.title}`} className={`insight-card kind-${insight.kind}`}>
                        <span className="insight-card-kind">{insight.kind}</span>
                        {insight.metric ? (
                          <strong className="insight-card-metric">{insight.metric}</strong>
                        ) : null}
                        <h4>{insight.title}</h4>
                        <p>{insight.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analytics?.categorical.length ? (
                <div className="viz-panel">
                  <h3>Segment mix (top values per field)</h3>
                  <ul className="category-mix-list">
                    {analytics.categorical.map((cat) => {
                      const rest = Math.max(0, 100 - cat.top.reduce((s, t) => s + t.pct, 0))
                      return (
                        <li key={cat.column}>
                          <div className="category-mix-head">
                            <strong>{cat.column}</strong>
                            <span>{cat.distinct} values</span>
                          </div>
                          <div className="category-mix-bar">
                            {cat.top.map((t, i) => (
                              <span
                                key={t.value}
                                title={`${t.value}: ${t.pct}%`}
                                style={{ width: `${t.pct}%`, background: MIX_COLORS[i] }}
                              />
                            ))}
                            {rest > 0 && (
                              <span
                                title={`Other: ${rest.toFixed(1)}%`}
                                style={{ width: `${rest}%`, background: "rgba(255,255,255,0.12)" }}
                              />
                            )}
                          </div>
                          <div className="category-mix-legend">
                            {cat.top.map((t, i) => (
                              <span key={t.value}>
                                <i style={{ background: MIX_COLORS[i] }} />
                                {t.value} {t.pct}%
                              </span>
                            ))}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

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
                  <h1 id="ws-report">Business insights</h1>
                </div>
                <InfoButton title="How the report is built">
                  <p>
                    This brief is derived from Analytics (step 2): the same derived insights and
                    charts, written as stakeholder-ready conclusions. Word for editing; PDF via
                    print for a fixed handout.
                  </p>
                </InfoButton>
              </div>
              <p className="results-section-lead">
                Summarized from step 2 analytics — business takeaways, not a raw table dump.
              </p>

              <article className="report-preview">
                <h3>Business insight brief</h3>
                <p className="report-kicker">{sourceName} · Derived from Analytics</p>
                <h4>Situation</h4>
                <p>{story.problem.statement}</p>
                <p>{story.problem.message}</p>
                {story.selection && (
                  <>
                    <h4>Preparation approach</h4>
                    <p>
                      <strong>{story.selection.formation.replace(/_/g, " ")}</strong>
                      {story.selection.sei != null
                        ? ` · score ${story.selection.sei.toFixed(3)}`
                        : ""}
                      . {story.selection.reason}
                    </p>
                  </>
                )}
                <h4>Business insights (from Analytics)</h4>
                <ol className="report-insight-list">
                  {(analyticsInsights.length
                    ? analyticsInsights.map((insight) => ({
                        title: insight.title,
                        detail: insight.metric
                          ? `${insight.detail} (${insight.metric})`
                          : insight.detail,
                      }))
                    : story.insights
                  ).map((insight) => (
                    <li key={insight.title}>
                      <strong>{insight.title}</strong>
                      <span>{insight.detail}</span>
                    </li>
                  ))}
                </ol>
                <h4>Recommended next actions</h4>
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
                <Button
                  onClick={() =>
                    downloadWordReport(story, sourceName, {
                      derivedInsights: analyticsInsights.map((i) => ({
                        title: i.title,
                        detail: i.metric ? `${i.detail} (${i.metric})` : i.detail,
                      })),
                    })
                  }
                >
                  Download Word (editable)
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    printReportAsPdf(story, sourceName, {
                      derivedInsights: analyticsInsights.map((i) => ({
                        title: i.title,
                        detail: i.metric ? `${i.detail} (${i.metric})` : i.detail,
                      })),
                    })
                  }
                >
                  Save as PDF / Print
                </Button>
              </div>

              <div className="journey-nav">
                <Button variant="secondary" onClick={() => onPageChange("visualize")}>
                  ← Analytics
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
