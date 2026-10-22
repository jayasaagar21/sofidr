import React, { useEffect, useRef, useState } from "react"
import { Button } from "./ui/Button"

const stages = [
  {
    title: "Dataset",
    label: "Step 1",
    description:
      "Upload your file. SOFIDR cleans it, shows a preview, and lets you download the result. Tap “Explain the approach” if you want a plain-language summary of what changed.",
    signal: "Preview + download",
    value: "Ready file",
  },
  {
    title: "Visualization",
    label: "Step 2",
    description:
      "Click through to charts: issue priorities, quality signals, and — when you compare options — how the six paper formations score on SEI.",
    signal: "Patterns",
    value: "Clear charts",
  },
  {
    title: "Report",
    label: "Step 3",
    description:
      "A research-style insight report built from steps 1 and 2: key conclusions, highlight charts, and next actions — without dumping the raw dataset.",
    signal: "Decision ready",
    value: "Insights",
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
          One step after another.
        </h2>
        <p>
          No clutter. Click through Dataset, Visualization, then Report — each step unlocks the next.
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
                  Try it <span aria-hidden="true">↓</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
