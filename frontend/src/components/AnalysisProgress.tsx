import React, { useEffect, useState } from "react"
import { ScanProgress, ScanStage } from "../lib/localClean"

const STAGE_ORDER: ScanStage[] = [
  "reading",
  "scanning",
  "repairing",
  "enhancing",
  "preparing",
]

const STAGE_COPY: Record<ScanStage, { title: string; detail: string }> = {
  reading: {
    title: "Read the file",
    detail: "Loading your spreadsheet into this session.",
  },
  scanning: {
    title: "Scan for issues",
    detail: "Looking for blanks, duplicates, and messy values.",
  },
  repairing: {
    title: "Repair the structure",
    detail: "Removing repeats and fixing empty or sentinel cells.",
  },
  enhancing: {
    title: "Enhance the fields",
    detail: "Standardizing common fields so the data is easier to use.",
  },
  preparing: {
    title: "Prepare your download",
    detail: "Building the cleaned file you can save and share a summary of.",
  },
}

interface AnalysisProgressProps {
  progress?: ScanProgress | null
  fileName?: string
  mode?: "server" | "local" | "auto"
}

export default function AnalysisProgress({
  progress = null,
  fileName = "",
  mode = "auto",
}: AnalysisProgressProps) {
  const [tickStage, setTickStage] = useState(0)

  useEffect(() => {
    if (progress) return
    const timers = [900, 2200, 4000, 5800].map((delay, index) =>
      window.setTimeout(() => setTickStage(index + 1), delay)
    )
    return () => timers.forEach(window.clearTimeout)
  }, [progress])

  const activeIndex = progress
    ? Math.max(0, STAGE_ORDER.indexOf(progress.stage))
    : tickStage
  const active = STAGE_ORDER[Math.min(activeIndex, STAGE_ORDER.length - 1)]
  const detail = progress?.detail || STAGE_COPY[active].detail
  const resolvedMode =
    mode === "auto" ? (progress ? "local" : "server") : mode

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <div className="progress-heading">
        <span className="progress-pulse" aria-hidden="true" />
        <div>
          <strong>
            {resolvedMode === "local"
              ? "Large-file clean in progress"
              : "Cleaning in progress"}
          </strong>
          <p>
            {fileName ? <span className="progress-file">{fileName} · </span> : null}
            {detail}
          </p>
          {progress && (
            <p className="progress-metrics">
              {progress.rowsSeen > 0 && (
                <span>{progress.rowsSeen.toLocaleString()} rows scanned</span>
              )}
              {progress.rowsWritten > 0 && (
                <span>{progress.rowsWritten.toLocaleString()} cleaned</span>
              )}
              {progress.duplicatesRemoved > 0 && (
                <span>{progress.duplicatesRemoved.toLocaleString()} duplicates removed</span>
              )}
              {progress.missingFilled > 0 && (
                <span>{progress.missingFilled.toLocaleString()} blanks filled</span>
              )}
            </p>
          )}
        </div>
        {progress && (
          <span className="progress-percent" aria-hidden="true">
            {progress.percent}%
          </span>
        )}
      </div>

      {progress && (
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
      )}

      <ol className="progress-stages progress-stages-five" aria-label="Cleaning journey">
        {STAGE_ORDER.map((stage, index) => {
          const status =
            index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending"
          return (
            <li key={stage} className={`is-${status}`}>
              <span className="progress-marker" aria-hidden="true">
                {status === "complete" ? "✓" : index + 1}
              </span>
              <span>{STAGE_COPY[stage].title}</span>
            </li>
          )
        })}
      </ol>
      <p className="progress-privacy">
        Your file is handled for this session only — nothing is saved for later.
      </p>
      <span className="sr-only">
        Stage {activeIndex + 1} of {STAGE_ORDER.length}: {STAGE_COPY[active].title}
      </span>
    </div>
  )
}
