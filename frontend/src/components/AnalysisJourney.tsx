import React, { useMemo, useState } from "react"
import {
  api,
  CleanResponse,
  DataExportFormat,
  DatasetProfile,
  OptimizeResponse,
} from "../api"
import { buildStoryReport } from "../lib/storyReport"
import {
  downloadWordReport,
  printReportAsPdf,
} from "../lib/reportExport"
import { Button } from "./ui/Button"
import InfoButton from "./InfoButton"

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
  if (!items.length) {
    return <p className="journey-caption">Charts appear once quality signals are available.</p>
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const isLocal = cleaning?.metadata.processingMode === "local"
  const m = cleaning?.metadata
  const preview = cleaning?.preview

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

  return (
    <div className="results-page">
      <header className="results-page-header">
        <button type="button" className="back-button" onClick={onReset}>
          ← Back to start
        </button>
        <p className="eyebrow">Your output</p>
        <h1>{sourceName}</h1>
        <p className="results-page-lead">
          One page. Three sections — cleaned data, a visual view, then a downloadable report.
        </p>
        <nav className="results-page-nav" aria-label="On this page">
          <a href="#out-dataset">Dataset</a>
          <a href="#out-visualize">Visualization</a>
          <a href="#out-report">Report</a>
        </nav>
      </header>

      {/* —— Dataset —— */}
      <section className="results-section" id="out-dataset" aria-labelledby="out-dataset-title">
        <div className="results-section-head">
          <div>
            <p className="eyebrow">Section 1</p>
            <h2 id="out-dataset-title">Dataset</h2>
          </div>
          <InfoButton title="How we handled your dataset">
            <p>
              <strong>What we received:</strong> your uploaded file for this session only. Nothing
              is kept after you leave.
            </p>
            <p>
              <strong>How we decided what to fix:</strong> we scan for empty cells, duplicate rows,
              and messy common fields (dates, names, categories). Issues that affect many rows are
              treated first.
            </p>
            <p>
              <strong>Cleaning steps:</strong> normalize empty values, remove exact duplicates, fill
              blanks with sensible defaults, and standardize frequent business fields so the file is
              easier to use.
            </p>
            {m?.steps?.length ? (
              <ol>
                {m.steps.map((step) => (
                  <li key={step}>{step.replace(/_/g, " ")}</li>
                ))}
              </ol>
            ) : null}
            <p>
              Large CSV files are cleaned in your browser so they stay practical at high volume.
              Smaller files use the same logic on the server for this session.
            </p>
          </InfoButton>
        </div>

        <p className="results-section-lead">
          Your cleaned output is ready. Preview it, download it, and open a short explanation if you
          want to know what changed.
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
            <p className="journey-caption">
              Example run — continue to Visualization and Report for insights.
            </p>
          )}
          <Button variant="secondary" onClick={() => setShowApproach((v) => !v)}>
            {showApproach ? "Hide explanation" : "Explain this output"}
          </Button>
        </div>
        {exportError && <p className="report-export-error" role="alert">{exportError}</p>}

        {showApproach && (
          <div className="journey-approach-body">
            <h3>What this output means</h3>
            <p>{story.problem.statement}</p>
            <p>{story.problem.message}</p>
          </div>
        )}

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

        {onRunStrategy && targetOptions.length > 0 && (
          <details className="journey-optional">
            <summary>Optional — compare preparation options</summary>
            <p>If you have a category to predict, we can compare preparation approaches for the charts and report.</p>
            <label htmlFor="journey-target">Category column</label>
            <select
              id="journey-target"
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
            >
              <option value="">Choose a column</option>
              {targetOptions.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
            <Button
              onClick={() => targetColumn && onRunStrategy(targetColumn)}
              disabled={!targetColumn || strategyLoading}
            >
              {strategyLoading ? "Comparing…" : "Compare"}
            </Button>
            {strategyError && <p className="report-export-error" role="alert">{strategyError}</p>}
          </details>
        )}
      </section>

      {/* —— Visualization —— */}
      <section className="results-section" id="out-visualize" aria-labelledby="out-viz-title">
        <div className="results-section-head">
          <div>
            <p className="eyebrow">Section 2</p>
            <h2 id="out-viz-title">Visualization</h2>
          </div>
          <InfoButton title="How we choose these charts">
            <p>
              <strong>From your dataset:</strong> we look at where problems concentrate (missing
              values, duplicates) and at overall quality dimensions.
            </p>
            <p>
              <strong>Why this format:</strong> simple bar views make it obvious which issues are
              largest and — when you compare options — which preparation approach scores highest.
            </p>
            <p>
              <strong>How we conclude:</strong> charts that highlight the biggest risks and the
              strongest preparation score are kept. Decorative charts that do not help a decision
              are left out.
            </p>
          </InfoButton>
        </div>

        <p className="results-section-lead">
          Want to see how your dataset looks more visually? These charts highlight what stands out.
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
      </section>

      {/* —— Report —— */}
      <section className="results-section" id="out-report" aria-labelledby="out-report-title">
        <div className="results-section-head">
          <div>
            <p className="eyebrow">Section 3</p>
            <h2 id="out-report-title">Report</h2>
          </div>
          <InfoButton title="How the report is built">
            <p>
              The report combines <strong>Section 1 (dataset)</strong> and{" "}
              <strong>Section 2 (visualization)</strong>: what was wrong, what was cleaned, what the
              charts emphasize, and what to do next.
            </p>
            <p>
              It does <strong>not</strong> include the full raw table — only the insights you need
              to brief someone or keep a record.
            </p>
            <p>
              <strong>Word</strong> is best when you want to edit wording before sharing.{" "}
              <strong>PDF</strong> is best for a fixed handout (use your system’s Save as PDF in the
              print dialog).
            </p>
          </InfoButton>
        </div>

        <p className="results-section-lead">
          Based on the dataset and visualizations above, here is a concise insight report you can
          download and edit.
        </p>

        <article className="report-preview" id="report-preview">
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
                {story.selection.sei != null ? ` · score ${story.selection.sei.toFixed(3)}` : ""}.{" "}
                {story.selection.reason}
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
        <p className="journey-caption">
          Prefer to edit first? Download Word, change the text in Microsoft Word, then export PDF
          from Word if needed.
        </p>

        <div className="journey-nav">
          <Button variant="secondary" onClick={onReset}>
            Analyze another file
          </Button>
        </div>
      </section>
    </div>
  )
}
