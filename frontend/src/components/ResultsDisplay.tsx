import React, { useState } from "react"
import {
  api,
  OptimizeResponse,
  Formation,
  EnhanceResponse,
  ReportFormat,
  DatasetProfile,
  CleanResponse,
} from "../api"
import { Button } from "./ui/Button"
import { Card } from "./ui/Card"
import DatasetProfileDisplay from "./DatasetProfileDisplay"
import ShareSummary from "./ShareSummary"
import VisualizationReport from "./VisualizationReport"

interface ResultsDisplayProps {
  result: OptimizeResponse
  formations: Formation
  enhancement: EnhanceResponse | null
  enhancementLoading: boolean
  enhancementError: string
  isUploadedFile: boolean
  profile: DatasetProfile | null
  onApplyRecommendation: () => void
  onReset: () => void
  cleaning?: CleanResponse | null
  sourceName?: string
}

export default function ResultsDisplay({
  result,
  formations,
  enhancement,
  enhancementLoading,
  enhancementError,
  isUploadedFile,
  profile,
  onApplyRecommendation,
  onReset,
  cleaning = null,
  sourceName,
}: ResultsDisplayProps) {
  const bestFormation = formations[result.best_by_sei] || {}
  const bestScore = result.scoreboard.find((item) => item.name === result.best_by_sei)
  const [reportLoading, setReportLoading] = useState<ReportFormat | null>(null)
  const [reportError, setReportError] = useState("")
  const [showVisualize, setShowVisualize] = useState(false)

  if (showVisualize) {
    return (
      <VisualizationReport
        optimize={result}
        profile={profile}
        cleaning={cleaning}
        sourceName={sourceName || result.dataset_name}
        onClose={() => setShowVisualize(false)}
      />
    )
  }

  const downloadReport = async (reportFormat: ReportFormat) => {
    setReportLoading(reportFormat)
    setReportError("")
    try {
      const report = await api.exportReport(result, reportFormat)
      const url = URL.createObjectURL(report.blob)
      const a = document.createElement("a")
      a.href = url
      a.download = report.filename
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Report export failed")
    } finally {
      setReportLoading(null)
    }
  }

  const downloadEnhancedCsv = () => {
    if (!enhancement) return
    const url = URL.createObjectURL(enhancement.blob)
    const a = document.createElement("a")
    a.href = url
    a.download = enhancement.metadata.filename
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const dimension = (rows: number | null, columns: number | null) =>
    rows === null || columns === null ? "Not reported" : `${rows.toLocaleString()} × ${columns}`

  if (!result.success) {
    return (
      <Card className="error-card">
        <h2>Optimization Failed</h2>
        <p>{result.error}</p>
        <Button onClick={onReset}>Try Again</Button>
      </Card>
    )
  }

  return (
    <div className="results-container">
      <button className="back-button" onClick={onReset}>
        ← New analysis
      </button>

      <Card className="results-header">
            <p className="eyebrow">Comparison complete</p>
        <div className="header-top">
          <div>
            <h1>{result.dataset_name}</h1>
            <p className="result-subtitle">
              Best way to prepare your data for: {result.target_column || "this example"}
            </p>
          </div>
          <div className="tags">
            {result.terrain_tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="formation-hero">
          <div className="formation-icon" aria-hidden="true">{bestFormation.icon}</div>
          <div className="formation-info">
            <span className="recommendation-label">Recommended approach</span>
            <h2>{result.best_by_sei.replace(/_/g, " ")}</h2>
            <p className="target-terrain">{bestFormation.target_terrain}</p>
          </div>
          <div className="hero-score">
            <span>SEI score</span>
            <strong>{bestScore?.sei.toFixed(3) || "—"}</strong>
          </div>
        </div>

        <div className="selection-info">
          <p>
            <strong>Learning policy:</strong> {result.selected.replace(/_/g, " ")}
            <span>{result.selection_reason}</span>
          </p>
        </div>
      </Card>

      {profile && <DatasetProfileDisplay profile={profile} />}

      {!!result.strategy_journey?.length && (
        <Card className="journey-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">How we reached this result</p>
              <h3>What SOFIDR did</h3>
            </div>
            <span className="method-note">Clear, repeatable steps</span>
          </div>
          <ol className="strategy-journey">
            {result.strategy_journey.map((step) => (
              <li key={step.phase}>
                <div>
                  <strong>{step.phase}</strong>
                  <span className={`journey-status status-${step.status}`}>{step.status}</span>
                </div>
                <p>{step.detail}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {result.benchmark && (
        <Card className="benchmark-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Fair benchmark</p>
              <h3>SOFIDR vs conventional baselines</h3>
            </div>
            <span className="method-note">{result.benchmark.source}</span>
          </div>
          <div className="benchmark-summary">
            <div>
              <span>SOFIDR ({result.benchmark.sofidr.formation.replace(/_/g, " ")})</span>
              <strong>{result.benchmark.sofidr.sei.toFixed(4)}</strong>
            </div>
            <div>
              <span>Best conventional ({result.benchmark.conventional?.label || "—"})</span>
              <strong>{result.benchmark.conventional?.sei.toFixed(4) || "—"}</strong>
            </div>
            <div>
              <span>Δ SEI</span>
              <strong>
                {result.benchmark.delta_sei > 0 ? "+" : ""}
                {result.benchmark.delta_sei.toFixed(4)}
              </strong>
            </div>
            <div>
              <span>Measured winner</span>
              <strong>{result.benchmark.winner}</strong>
            </div>
          </div>
          <p className="benchmark-note">
            Conventional baselines are the paper’s None / Standard / PCA / Full pipelines.
            Scores use the same SEI weights and CV conditions. SOFIDR is not forced to win.
          </p>
          <div className="table-container">
            <table className="scoreboard-table">
              <caption className="sr-only">Conventional baseline SEI scores</caption>
              <thead>
                <tr>
                  <th>Baseline</th>
                  <th>SEI</th>
                  <th>Accuracy</th>
                  <th>Stability</th>
                  <th>Retention</th>
                  <th>Simplicity</th>
                </tr>
              </thead>
              <tbody>
                {result.benchmark.baselines.map((baseline) => (
                  <tr
                    key={baseline.name}
                    className={
                      baseline.name === result.benchmark?.conventional?.name ? "best-row" : ""
                    }
                  >
                    <td>
                      <strong>{baseline.label}</strong>
                      <small className="baseline-desc">{baseline.description}</small>
                    </td>
                    <td className="number"><strong>{baseline.sei.toFixed(4)}</strong></td>
                    <td className="number">{baseline.accuracy.toFixed(4)}</td>
                    <td className="number">{baseline.stability.toFixed(4)}</td>
                    <td className="number">{baseline.retention.toFixed(3)}</td>
                    <td className="number">{baseline.simplicity.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isUploadedFile && (
        <Card className="enhancement-card" aria-live="polite">
          <div className="enhancement-heading">
            <div>
              <p className="eyebrow">Final model-ready artifact</p>
              <h3>Enhanced CSV</h3>
            </div>
            {enhancement && <span className="artifact-ready">Ready to download</span>}
          </div>

          {enhancementLoading && (
            <div className="enhancement-status" role="status">
              <span className="enhancement-spinner" aria-hidden="true" />
              <div>
                <strong>Applying {result.best_by_sei.replace(/_/g, " ")}</strong>
                <p>The winning formation is preparing your final CSV.</p>
              </div>
            </div>
          )}

          {enhancementError && (
            <div className="enhancement-error" role="alert">
              <strong>Analysis finished, but enhancement could not complete.</strong>
              <p>{enhancementError}</p>
              <p>Your decision record is still available below.</p>
            </div>
          )}

          {!enhancement && !enhancementLoading && !enhancementError && (
            <div className="enhancement-status">
              <div>
                <strong>Recommendation ready for review</strong>
                <p>Apply {result.best_by_sei.replace(/_/g, " ")} to create a model-ready export.</p>
              </div>
              <Button onClick={onApplyRecommendation}>Apply recommendation</Button>
            </div>
          )}

          {enhancement && (
            <>
              <dl className="artifact-metrics">
                <div>
                  <dt>Before</dt>
                  <dd>{dimension(enhancement.metadata.before.rows, enhancement.metadata.before.columns)}</dd>
                  <span>rows × columns</span>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>{dimension(enhancement.metadata.after.rows, enhancement.metadata.after.columns)}</dd>
                  <span>rows × columns</span>
                </div>
                <div>
                  <dt>Synthetic rows</dt>
                  <dd>{enhancement.metadata.syntheticCount.toLocaleString()}</dd>
                  <span>added by formation</span>
                </div>
              </dl>

              <div className="artifact-detail-grid">
                <div className="formation-steps">
                  <span className="detail-label">Formation steps</span>
                  {enhancement.metadata.formationSteps.length ? (
                    <ol>
                      {enhancement.metadata.formationSteps.map((step, index) => (
                        <li key={`${step}-${index}`}>{step}</li>
                      ))}
                    </ol>
                  ) : (
                    <p>{enhancement.metadata.formation.replace(/_/g, " ")}</p>
                  )}
                </div>
                <div className="csv-preview">
                  <div className="preview-heading">
                    <span className="detail-label">CSV preview</span>
                    <span>First {enhancement.preview.rows.length} rows</span>
                  </div>
                  <div className="table-container">
                    <table>
                      <caption className="sr-only">
                        Preview of the enhanced model-ready CSV
                      </caption>
                      <thead>
                        <tr>
                          {enhancement.preview.columns.map((column, index) => (
                            <th key={`${column}-${index}`} scope="col">{column || `Column ${index + 1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {enhancement.preview.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {enhancement.preview.columns.map((_, columnIndex) => (
                              <td key={columnIndex} title={row[columnIndex] || ""}>
                                {row[columnIndex] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      <div className="results-grid">
        <Card className="scoreboard">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Comparative performance</p>
              <h3>Formation scoreboard</h3>
            </div>
            <span className="method-note">3-fold stratified validation</span>
          </div>
          <div className="table-container">
            <table className="scoreboard-table">
              <caption className="sr-only">
                Preprocessing formations ranked by Strategic Efficiency Index
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th>Formation</th>
                  <th>SEI</th>
                  <th>Accuracy</th>
                  <th>Stability</th>
                  <th>Retention</th>
                  <th>Simplicity</th>
                </tr>
              </thead>
              <tbody>
                {result.scoreboard.slice(0, 8).map((f, index) => (
                  <tr key={f.name} className={f.name === result.best_by_sei ? "best-row" : ""}>
                    <td className="rank-number">{String(index + 1).padStart(2, "0")}</td>
                    <td className="formation-name">
                      <strong>{f.name.replace(/_/g, " ")}</strong>
                      {f.error && <span className="error-badge">error</span>}
                    </td>
                    <td className="number">
                      <strong>{f.sei.toFixed(4)}</strong>
                    </td>
                    <td className="number">{f.accuracy.toFixed(4)}</td>
                    <td className="number">{f.stability.toFixed(4)}</td>
                    <td className="number">{f.retention.toFixed(3)}</td>
                    <td className="number">{f.simplicity.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="sei-breakdown">
          <p className="eyebrow">Winning formation</p>
          <h3>SEI breakdown</h3>
          <div className="sei-components">
            <div className="component">
              <div className="label">Accuracy (40%)</div>
              <div className="bar" role="progressbar" aria-label="Accuracy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(bestScore?.accuracy || 0) * 100}>
                <div
                  className="fill"
                  style={{ width: `${(bestScore?.accuracy || 0) * 100}%` }}
                ></div>
              </div>
              <div className="value">{bestScore?.accuracy.toFixed(3) || "—"}</div>
            </div>
            <div className="component">
              <div className="label">Stability (25%)</div>
              <div className="bar" role="progressbar" aria-label="Stability" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(bestScore?.stability || 0) * 100}>
                <div
                  className="fill"
                  style={{ width: `${(bestScore?.stability || 0) * 100}%` }}
                ></div>
              </div>
              <div className="value">{bestScore?.stability.toFixed(3) || "—"}</div>
            </div>
            <div className="component">
              <div className="label">Retention (20%)</div>
              <div className="bar" role="progressbar" aria-label="Retention" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(bestScore?.retention || 0) * 100}>
                <div
                  className="fill"
                  style={{ width: `${(bestScore?.retention || 0) * 100}%` }}
                ></div>
              </div>
              <div className="value">{bestScore?.retention.toFixed(3) || "—"}</div>
            </div>
            <div className="component">
              <div className="label">Simplicity (15%)</div>
              <div className="bar" role="progressbar" aria-label="Simplicity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(bestScore?.simplicity || 0) * 100}>
                <div
                  className="fill"
                  style={{ width: `${(bestScore?.simplicity || 0) * 100}%` }}
                ></div>
              </div>
              <div className="value">{bestScore?.simplicity.toFixed(3) || "—"}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="report">
        <p className="eyebrow">Decision record</p>
        <h3>Analysis report</h3>
        <pre>{result.report}</pre>
      </Card>

      {result.research && (
        <Card className="research-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Research evidence</p>
              <h3>Why this formation fits SOFIDR</h3>
            </div>
            <span className="method-note">{result.research.source.date}</span>
          </div>
          <p className="research-source">{result.research.source.title}</p>
          <p>
            Selected formation <strong>{result.research.selected_formation.formation.replace(/_/g, " ")}</strong>
            {" "}({result.research.selected_formation.note}). Target terrain:{" "}
            {result.research.selected_formation.target_terrain}.
          </p>
          {result.research.selected_formation.table_1 && (
            <dl className="technique-grid">
              {Object.entries(result.research.selected_formation.table_1).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/_/g, " ")}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="table-container">
            <table className="issue-table">
              <caption className="sr-only">Techniques inside the selected formation</caption>
              <thead>
                <tr>
                  <th>Technique</th>
                  <th>Problem</th>
                  <th>Conditions</th>
                  <th>Risk</th>
                  <th>Research</th>
                </tr>
              </thead>
              <tbody>
                {result.research.selected_formation.techniques.map((technique) => (
                  <tr key={technique.technique}>
                    <td><strong>{technique.technique}</strong></td>
                    <td>{technique.problem_addressed}</td>
                    <td>{technique.suitable_conditions}</td>
                    <td>{technique.information_loss_risk}</td>
                    <td>{technique.research_support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="visualize-cta-card">
        <div className="visualize-cta-copy">
          <p className="eyebrow">Storytelling analytics</p>
          <h3>See the full visual story of this dataset</h3>
          <p>
            Problem statement, why the formation won (SEI + paper Table 1), charts for every
            option compared, significant business insights, and clear next actions.
          </p>
        </div>
        <Button className="visualize-cta-btn" onClick={() => setShowVisualize(true)}>
          Visualize
        </Button>
      </Card>

      <Card className="share-summary-card">
        <ShareSummary
          sourceName={sourceName || result.dataset_name}
          cleaning={cleaning}
          optimize={result}
        />
      </Card>

      <Card className="report-export-card">
        <div className="report-export-heading">
          <div>
            <p className="eyebrow">Portable reports</p>
            <h3>Download the analysis in your preferred format.</h3>
          </div>
          <span>Visualize · JSON · HTML · PDF · Excel</span>
        </div>
        <div className="report-format-actions" aria-label="Report download formats">
          <Button onClick={() => setShowVisualize(true)}>Visualize</Button>
          {([
            ["json", "JSON"],
            ["html", "HTML"],
            ["pdf", "PDF"],
            ["xlsx", "Excel"],
          ] as const).map(([format, label]) => (
            <Button
              key={format}
              variant="secondary"
              onClick={() => downloadReport(format)}
              disabled={reportLoading !== null}
            >
              {reportLoading === format ? `Preparing ${label}…` : `Download ${label}`}
            </Button>
          ))}
        </div>
        {reportError && <p className="report-export-error" role="alert">{reportError}</p>}
      </Card>

      <div className="actions">
        {enhancement && (
          <Button onClick={downloadEnhancedCsv} className="download-btn">
            Download enhanced CSV
          </Button>
        )}
        <Button onClick={onReset} variant="secondary">
          Optimize Another Dataset
        </Button>
      </div>
    </div>
  )
}
