import React, { useEffect, useState } from "react"
import { ScanProgress } from "../lib/localClean"
import { STRATEGY_STAGES } from "../lib/cleanRules"

interface ProcessingPageProps {
  fileName: string
  progress: ScanProgress | null
  error: string
  onCancel: () => void
}

/** ~5 second staged breakdown of strategy + cleaning before results. */
export default function ProcessingPage({
  fileName,
  progress,
  error,
  onCancel,
}: ProcessingPageProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => Math.min(t + 1, STRATEGY_STAGES.length - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const fromProgress =
    progress == null
      ? -1
      : progress.stage === "reading"
        ? 0
        : progress.stage === "scanning"
          ? 1
          : progress.stage === "repairing"
            ? 2
            : progress.stage === "enhancing"
              ? 3
              : 4

  const activeIndex = Math.max(tick, fromProgress === -1 ? tick : fromProgress)
  const percent = progress?.percent
    ? Math.max(progress.percent, Math.round(((activeIndex + 1) / STRATEGY_STAGES.length) * 100))
    : Math.min(96, Math.round(((activeIndex + 1) / STRATEGY_STAGES.length) * 92))

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
            <small>Added · understanding & cleaning</small>
          </div>
          <span className="process-file-pulse" aria-hidden="true" />
        </div>

        <h1>Profiling & cleaning in progress</h1>
        <p className="process-page-lead">
          Judging schema and quality, selecting tactics, applying synonym collapse and repairs.
          ~5s breakdown, then the Dataset page with before/after preview.
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

        <ol className="process-live-steps" aria-label="Strategy and cleaning steps">
          {STRATEGY_STAGES.map((step, index) => {
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
                    {status === "active" && progress?.detail ? progress.detail : step.detail}
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
