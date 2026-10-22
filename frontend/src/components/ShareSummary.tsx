import React, { useState } from "react"
import { CleanResponse, OptimizeResponse } from "../api"
import { Button } from "./ui/Button"

interface ShareSummaryProps {
  sourceName: string
  cleaning?: CleanResponse | null
  optimize?: OptimizeResponse | null
}

function buildText({ sourceName, cleaning, optimize }: ShareSummaryProps): string {
  const lines = [
    "SOFIDR result summary",
    `Dataset: ${sourceName}`,
  ]

  if (cleaning) {
    const m = cleaning.metadata
    lines.push(
      `Rows: ${(m.before.rows ?? 0).toLocaleString()} → ${(m.after.rows ?? 0).toLocaleString()}`,
      `Duplicates removed: ${m.duplicatesRemoved.toLocaleString()}`,
      `Missing cells filled: ${m.missingFilled.toLocaleString()}`,
      m.completenessBefore != null && m.completenessAfter != null
        ? `Completeness: ${m.completenessBefore}% → ${m.completenessAfter}%`
        : "",
      m.processingMode === "local" ? "Processed in-browser (large-file path)" : "Processed in this session",
      m.scaleNote || ""
    )
  }

  if (optimize) {
    lines.push(
      `Best preparation: ${optimize.best_by_sei}`,
      `SEI score: ${optimize.scoreboard.find((s) => s.name === optimize.best_by_sei)?.sei?.toFixed?.(3) ?? "—"}`,
      optimize.selection_reason || ""
    )
  }

  lines.push("", "Cleaned with SOFIDR — https://sofidr.vercel.app")
  return lines.filter(Boolean).join("\n")
}

export default function ShareSummary(props: ShareSummaryProps) {
  const [status, setStatus] = useState("")
  const text = buildText(props)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus("Summary copied — paste it into email, Slack, or LinkedIn.")
    } catch {
      setStatus("Could not copy automatically. Download the text file instead.")
    }
  }

  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "sofidr-result-summary.txt"
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setStatus("Summary file downloaded.")
  }

  const nativeShare = async () => {
    if (!navigator.share) {
      await copy()
      return
    }
    try {
      await navigator.share({
        title: "SOFIDR result summary",
        text,
      })
      setStatus("Shared.")
    } catch {
      // User cancelled — no error noise.
    }
  }

  return (
    <div className="share-summary">
      <div className="share-summary-copy">
        <p className="eyebrow">Shareable result</p>
        <h3>Send a clear summary without sending the raw file</h3>
        <p>
          Copy a short plain-language summary of what SOFIDR found and fixed.
          Your data file itself is not included.
        </p>
      </div>
      <div className="share-summary-actions">
        <Button onClick={copy}>Copy summary</Button>
        <Button variant="secondary" onClick={nativeShare}>
          Share…
        </Button>
        <Button variant="secondary" onClick={download}>
          Download .txt
        </Button>
      </div>
      {status && <p className="share-summary-status" role="status">{status}</p>}
    </div>
  )
}
