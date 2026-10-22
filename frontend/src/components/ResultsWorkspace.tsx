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

function PageReveal({
  title,
  detail,
  onDone,
}: {
  title: string
  detail: string
  onDone: () => void
}) {
  const doneRef = React.useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const t = window.setTimeout(() => doneRef.current(), 2200)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="page-reveal" role="status" aria-live="polite">
      <span className="progress-pulse" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className="process-page-bar-track">
        <span className="page-reveal-bar" />
      </div>
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

  useEffect(() => {
    if (page === "visualize") setVizReady(false)
    if (page === "report") setReportReady(false)
    window.scrollTo({ top: 0, behavior: "auto" })
  }, [page])

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
            Scan complete. Preview the cleaned data, download it, and continue when you’re ready
            for visualization.
          </p>

          <details
            className="scan-log"
            open={showSteps}
            onToggle={(e) => setShowSteps((e.target as HTMLDetailsElement).open)}
          >
            <summary>
              {showSteps ? "Hide scanning steps" : "Show scanning steps"}
              <small>{scanLog.length ? `${scanLog.length} steps` : "optional"}</small>
            </summary>
            <ol>
              {(scanLog.length
                ? scanLog
                : m?.steps?.map((s) => s.replace(/_/g, " ")) || [
                    "File added",
                    "Structure read",
                    "Issues scanned",
                    "Repairs applied",
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
                <span>First {preview.rows.length} rows</span>
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
            <PageReveal
              title="Building visualization"
              detail="Turning scan findings into clear charts…"
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
                    Charts highlight where problems concentrated and what quality looks like after
                    cleaning. Decorative charts that do not help a decision are left out.
                  </p>
                </InfoButton>
              </div>
              <p className="results-section-lead">
                Same motion as the scan — now focused on patterns. Continue when you’re ready for
                the report.
              </p>
              <div className="viz-grid-2">
                <div className="viz-panel">
                  <h3>Where attention is needed</h3>
                  <BarChart items={issueBars} max={100} valueFormat={(v) => `${v.toFixed(1)}%`} />
                </div>
                <div className="viz-panel">
                  <h3>{scoreboardBars.length ? "Preparation scores" : "Quality view"}</h3>
                  <BarChart
                    items={scoreboardBars.length ? scoreboardBars : qualityBars}
                    max={scoreboardBars.length ? undefined : 100}
                    valueFormat={(v) => (scoreboardBars.length ? v.toFixed(3) : v.toFixed(1))}
                  />
                </div>
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
            <PageReveal
              title="Generating report"
              detail="Combining the dataset and visualizations into an insight report…"
              onDone={() => setReportReady(true)}
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
                  Save as PDF
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
