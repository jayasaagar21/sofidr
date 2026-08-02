import React, { useState } from "react"
import { api, CleanResponse, DataExportFormat } from "../api"
import { Button } from "./ui/Button"
import { Card } from "./ui/Card"

interface CleaningResultsDisplayProps {
  result: CleanResponse
  sourceFile: File | null
  sourceName: string
  onReset: () => void
}

export default function CleaningResultsDisplay({
  result,
  sourceFile,
  sourceName,
  onReset,
}: CleaningResultsDisplayProps) {
  const [exportLoading, setExportLoading] = useState<DataExportFormat | null>(null)
  const [exportError, setExportError] = useState("")

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const download = async (format: DataExportFormat) => {
    if (!sourceFile) {
      if (format === "csv") downloadBlob(result.blob, result.metadata.filename)
      return
    }
    setExportLoading(format)
    setExportError("")
    try {
      if (format === "csv" && result.metadata.exportFormat === "csv") {
        downloadBlob(result.blob, result.metadata.filename)
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

  const dimensions = (rows: number | null, columns: number | null) =>
    rows === null || columns === null ? "—" : `${rows.toLocaleString()} × ${columns}`

  return (
    <div className="results-container cleaning-results">
      <button className="back-button" onClick={onReset}>← Process another dataset</button>

      <Card className="results-header cleaning-header">
        <p className="eyebrow">Enhancement complete</p>
        <div className="header-top">
          <div>
            <h1>{sourceName}</h1>
            <p className="result-subtitle">
              SOFIDR cleaned and enhanced the full dataset. Download the result in CSV, Excel, or JSON.
            </p>
          </div>
          <span className="artifact-ready">Enhanced dataset ready</span>
        </div>
      </Card>

      <Card className="enhancement-card">
        <div className="enhancement-heading">
          <div>
            <p className="eyebrow">Quality improvement</p>
            <h3>Repairs applied to every uploaded row</h3>
          </div>
          <span className="method-note">
            Source: {result.metadata.sourceFormat.toUpperCase()}
          </span>
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
              <span className="detail-label">Enhanced data preview</span>
              <span>First {result.preview.rows.length} rows</span>
            </div>
            <div className="table-container">
              <table>
                <caption className="sr-only">Preview of the enhanced dataset</caption>
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

      <Card className="report-export-card">
        <div className="report-export-heading">
          <div>
            <p className="eyebrow">Enhanced dataset downloads</p>
            <h3>Choose the most common portable formats.</h3>
          </div>
          <span>CSV · Excel · JSON</span>
        </div>
        <div className="report-format-actions" aria-label="Enhanced dataset formats">
          {([
            ["csv", "CSV"],
            ["xlsx", "Excel"],
            ["json", "JSON"],
          ] as const).map(([format, label]) => (
            <Button
              key={format}
              variant={format === "csv" ? "primary" : "secondary"}
              onClick={() => download(format)}
              disabled={exportLoading !== null}
            >
              {exportLoading === format ? `Preparing ${label}…` : `Download ${label}`}
            </Button>
          ))}
        </div>
        {exportError && <p className="report-export-error" role="alert">{exportError}</p>}
      </Card>

      <div className="actions">
        <Button onClick={onReset} variant="secondary">Process Another Dataset</Button>
      </div>
    </div>
  )
}
