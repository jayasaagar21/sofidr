import React, { useEffect, useState } from "react"

const stages = [
  { title: "Reading dataset", detail: "Parsing CSV, TSV, Excel, or JSON into a tabular frame." },
  { title: "Repairing structure", detail: "Fixing malformed rows, duplicates, types, and sentinels." },
  { title: "Enhancing fields", detail: "Normalizing dates, currency, categories, and missing values." },
  { title: "Preparing downloads", detail: "Building the enhanced CSV, Excel, and JSON outputs." },
]

export default function AnalysisProgress() {
  const [activeStage, setActiveStage] = useState(0)

  useEffect(() => {
    const timers = [900, 2400, 4400].map((delay, index) =>
      window.setTimeout(() => setActiveStage(index + 1), delay)
    )
    return () => timers.forEach(window.clearTimeout)
  }, [])

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <div className="progress-heading">
        <span className="progress-pulse" aria-hidden="true" />
        <div>
          <strong>Analysis in progress</strong>
          <p>{stages[activeStage].detail}</p>
        </div>
      </div>
      <ol className="progress-stages" aria-label="Analysis progress">
        {stages.map((stage, index) => {
          const status = index < activeStage ? "complete" : index === activeStage ? "active" : "pending"
          return (
            <li key={stage.title} className={`is-${status}`}>
              <span className="progress-marker" aria-hidden="true">
                {status === "complete" ? "✓" : index + 1}
              </span>
              <span>{stage.title}</span>
            </li>
          )
        })}
      </ol>
      <span className="sr-only">
        Stage {activeStage + 1} of {stages.length}: {stages[activeStage].title}
      </span>
    </div>
  )
}
