import React, { useEffect, useState } from "react"
import { ScanProgress } from "../lib/localClean"

const FALLBACK_STEPS = [
  { title: "File added", detail: "Your document is in this session." },
  { title: "Reading structure", detail: "Parsing rows and columns." },
  { title: "Scanning for issues", detail: "Checking blanks, duplicates, and odd values." },
  { title: "Repairing data", detail: "Cleaning and standardizing fields." },
  { title: "Preparing preview", detail: "Building your downloadable result." },
]

interface ProcessingPageProps {
  fileName: string
  progress: ScanProgress | null
  error: string
  onCancel: () => void
}

export default function ProcessingPage({
  fileName,
  progress,
  error,
  onCancel,
}: ProcessingPageProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (progress) return
    const id = window.setInterval(() => {
      setTick((t) => Math.min(t + 1, FALLBACK_STEPS.length - 1))
    }, 1100)
    return () => window.clearInterval(id)
  }, [progress])

  const activeIndex = progress
    ? progress.stage === "reading"
      ? 1
      : progress.stage === "scanning"
        ? 2
        : progress.stage === "repairing"
          ? 3
          : progress.stage === "enhancing"
            ? 3
            : 4
    : tick

  const percent = progress?.percent ?? Math.min(92, 12 + activeIndex * 18)

  return (
    <div className="process-page">
      <header className="process-page-bar">
        <button type="button" className="back-button" onClick={onCancel}>
          ← Back
        </button>
        <p className="process-page-note">Session only · nothing stored</p>
      </header>

      <main className="process-page-main">
        <div className="process-file-chip" aria-live="polite">
          <span className="process-file-icon" aria-hidden="true" />
          <div>
            <strong>{fileName || "Your file"}</strong>
            <small>Added · scanning now</small>
          </div>
          <span className="process-file-pulse" aria-hidden="true" />
        </div>

        <h1>Scanning your data</h1>
        <p className="process-page-lead">
          Watch each step as SOFIDR analyzes the file. When this finishes, you’ll move to the
          results pages.
        </p>

        <div
          className="process-page-bar-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="process-page-pct">{percent}%</p>

        <ol className="process-live-steps" aria-label="Analysis steps">
          {FALLBACK_STEPS.map((step, index) => {
            const status =
              index < activeIndex ? "done" : index === activeIndex ? "active" : "pending"
            return (
              <li key={step.title} className={`is-${status}`}>
                <span className="process-live-marker" aria-hidden="true">
                  {status === "done" ? "✓" : index + 1}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>
                    {status === "active" && progress?.detail
                      ? progress.detail
                      : step.detail}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>

        {progress && (progress.rowsSeen > 0 || progress.rowsWritten > 0) && (
          <p className="process-live-metrics">
            {progress.rowsSeen > 0 && (
              <span>{progress.rowsSeen.toLocaleString()} rows scanned</span>
            )}
            {progress.rowsWritten > 0 && (
              <span>{progress.rowsWritten.toLocaleString()} cleaned</span>
            )}
            {progress.duplicatesRemoved > 0 && (
              <span>{progress.duplicatesRemoved.toLocaleString()} duplicates removed</span>
            )}
          </p>
        )}

        {error && (
          <div className="error-message" role="alert">
            {error}
            <button type="button" className="back-button" onClick={onCancel}>
              ← Try again
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
