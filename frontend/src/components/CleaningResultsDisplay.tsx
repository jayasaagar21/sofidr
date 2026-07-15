import React from "react"
import { CleanResponse } from "../api"
import { Button } from "./ui/Button"
import { Card } from "./ui/Card"

interface CleaningResultsDisplayProps {
  result: CleanResponse
  sourceName: string
  onReset: () => void
}

export default function CleaningResultsDisplay({
  result,
  sourceName,
  onReset,
}: CleaningResultsDisplayProps) {
  const download = () => {
    const url = URL.createObjectURL(result.blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = result.metadata.filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const dimensions = (rows: number | null, columns: number | null) =>
    rows === null || columns === null ? "—" : `${rows.toLocaleString()} × ${columns}`

  return (
    <div className="results-container cleaning-results">
      <button className="back-button" onClick={onReset}>← Clean another dataset</button>

      <Card className="results-header cleaning-header">
        <p className="eyebrow">Cleaning complete</p>
        <div className="header-top">
          <div>
            <h1>{sourceName}</h1>
            <p className="result-subtitle">
              SOFIDR detected a mixed dataset without a classification target and used cleaning-only mode.
            </p>
          </div>
          <span className="artifact-ready">Cleaned CSV ready</span>
        </div>
      </Card>

      <Card className="enhancement-card">
        <div className="enhancement-heading">
          <div>
            <p className="eyebrow">Quality improvement</p>
            <h3>Repairs applied to the full dataset</h3>
          </div>
        </div>
        <dl className="artifact-metrics cleaning-metrics">
          <div>
            <dt>Before</dt>
            <dd>{dimensions(result.metadata.before.rows, result.metadata.before.columns)}</dd>
            <span>rows × columns</span>
          </div>
          <div>
            <dt>After</dt>
            <dd>{dimensions(result.metadata.after.rows, result.metadata.after.columns)}</dd>
            <span>rows × columns</span>
          </div>
          <div>
            <dt>Duplicates removed</dt>
            <dd>{result.metadata.duplicatesRemoved.toLocaleString()}</dd>
            <span>exact repeated rows</span>
          </div>
          <div>
            <dt>Missing cells filled</dt>
            <dd>{result.metadata.missingFilled.toLocaleString()}</dd>
            <span>with traceable indicators</span>
          </div>
          <div>
            <dt>Completeness</dt>
            <dd>
              {result.metadata.completenessBefore?.toFixed(1) || "—"}% →{" "}
              {result.metadata.completenessAfter?.toFixed(1) || "—"}%
            </dd>
            <span>populated cells</span>
          </div>
        </dl>

        <div className="artifact-detail-grid">
          <div className="formation-steps">
            <span className="detail-label">Cleaning steps</span>
            <ol>
              {result.metadata.steps.map((step, index) => (
                <li key={`${step}-${index}`}>{step.replace(/_/g, " ")}</li>
              ))}
            </ol>
          </div>
          <div className="csv-preview">
            <div className="preview-heading">
              <span className="detail-label">Cleaned CSV preview</span>
              <span>First {result.preview.rows.length} rows</span>
            </div>
            <div className="table-container">
              <table>
                <caption className="sr-only">Preview of the cleaned CSV</caption>
                <thead>
                  <tr>
                    {result.preview.columns.map((column, index) => (
                      <th key={`${column}-${index}`} scope="col">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {result.preview.columns.map((_, columnIndex) => (
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
      </Card>

      <div className="actions">
        <Button onClick={download} className="download-btn">Download cleaned CSV</Button>
        <Button onClick={onReset} variant="secondary">Clean Another Dataset</Button>
      </div>
    </div>
  )
}
