import React, { useEffect, useRef, useState } from "react"
import { Button } from "./ui/Button"

const stages = [
  {
    title: "Scan the dataset",
    label: "See what needs attention",
    description:
      "SOFIDR reads your file and checks for blanks, duplicates, unusual values, and columns that may need attention — then shows what it found in plain language.",
    signal: "Data scan",
    value: "Issues listed",
  },
  {
    title: "Clean every row",
    label: "Get a usable file",
    description:
      "Structure is repaired, empty cells are filled with traceable defaults, and common fields are standardized. You download a cleaned dataset — not just a report.",
    signal: "Full clean",
    value: "Ready CSV",
  },
  {
    title: "Compare options (optional)",
    label: "When you have a category to predict",
    description:
      "If your data has a category column to predict, SOFIDR can compare six proven ways to prepare it under the same conditions.",
    signal: "Fair comparison",
    value: "6 approaches",
  },
  {
    title: "Visualize & decide",
    label: "Turn analysis into action",
    description:
      "Open Visualize for a storytelling report: the problem, why a formation won under SEI, charts across options, significant insights, and next action items — then share a summary without sending the raw file.",
    signal: "Decision story",
    value: "Insights + actions",
  },
]

interface GuidedProcessDemoProps {
  active: boolean
  onChooseBenchmark: () => void
}

export default function GuidedProcessDemo({
  active,
  onChooseBenchmark,
}: GuidedProcessDemoProps) {
  const [stage, setStage] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (active) {
      setStage(0)
      headingRef.current?.focus({ preventScroll: true })
    }
  }, [active])

  const selectStage = (index: number) => setStage(index)
  const current = stages[stage]

  return (
    <section
      className={`process-demo ${active ? "is-active" : ""}`}
      id="process-demo"
      aria-labelledby="process-title"
    >
      <div className="process-intro">
        <p className="eyebrow">How it works</p>
        <h2 id="process-title" ref={headingRef} tabIndex={-1}>
          Scan → clean → download. Step by step.
        </h2>
        <p>
          Follow the journey in plain language. Large CSV files are cleaned in your
          browser so scale stays practical — and nothing is kept after the session.
        </p>
      </div>

      <div className="process-shell">
        <ol className="process-steps" aria-label="How SOFIDR works">
          {stages.map((item, index) => (
            <li key={item.title}>
              <button
                type="button"
                className={index === stage ? "is-current" : ""}
                aria-current={index === stage ? "step" : undefined}
                onClick={() => selectStage(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.title}</strong>
              </button>
            </li>
          ))}
        </ol>

        <div className="process-stage" aria-live="polite">
          <div className="process-visual" aria-hidden="true">
            <div className={`process-orbit process-orbit-${stage}`}>
              {stages.map((_, index) => (
                <span key={index} className={index <= stage ? "is-lit" : ""} />
              ))}
            </div>
            <div className="process-reading">
              <small>{current.signal}</small>
              <strong>{current.value}</strong>
            </div>
          </div>
          <div className="process-copy">
            <span className="process-kicker">{current.label}</span>
            <h3>{current.title}</h3>
            <p>{current.description}</p>
            <div className="process-controls">
              {stage > 0 && (
                <Button variant="secondary" onClick={() => selectStage(stage - 1)}>
                  Previous
                </Button>
              )}
              {stage < stages.length - 1 ? (
                <Button onClick={() => selectStage(stage + 1)}>
                  Next <span aria-hidden="true">→</span>
                </Button>
              ) : (
                <Button onClick={onChooseBenchmark}>
                  Try an example <span aria-hidden="true">↓</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
