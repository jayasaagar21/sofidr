import React from "react"
import { OptimizeResponse, Formation } from "../api"
import { Button } from "./ui/Button"
import { Card } from "./ui/Card"

interface ResultsDisplayProps {
  result: OptimizeResponse
  formations: Formation
  onReset: () => void
}

export default function ResultsDisplay({
  result,
  formations,
  onReset,
}: ResultsDisplayProps) {
  const bestFormation = formations[result.best_by_sei] || {}
  const bestScore = result.scoreboard.find((item) => item.name === result.best_by_sei)

  const downloadResults = () => {
    const data = {
      dataset: result.dataset_name,
      bestFormation: result.best_by_sei,
      selected: result.selected,
      selectionReason: result.selection_reason,
      terrain: {
        tags: result.terrain_tags,
        coldStartDefault: result.cold_start_default,
      },
      scoreboard: result.scoreboard,
      timestamp: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sofidr-results-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

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
        <p className="eyebrow">Analysis complete</p>
        <div className="header-top">
          <div>
            <h1>{result.dataset_name}</h1>
            <p className="result-subtitle">Recommended preprocessing formation</p>
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
            <span className="recommendation-label">Best strategic fit</span>
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

      <div className="actions">
        <Button onClick={downloadResults} className="download-btn">
          Export decision record
        </Button>
        <Button onClick={onReset} variant="secondary">
          Optimize Another Dataset
        </Button>
      </div>
    </div>
  )
}
