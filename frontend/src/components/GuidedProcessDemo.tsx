import React, { useEffect, useRef, useState } from "react"
import { Button } from "./ui/Button"

const stages = [
  {
    title: "Understand your data",
    label: "See what needs attention",
    description:
      "SOFIDR checks your file for blanks, duplicates, unusual values, and columns that may need attention.",
    signal: "Data check",
    value: "Clear overview",
  },
  {
    title: "Compare the options",
    label: "Test what fits best",
    description:
      "For classification data, SOFIDR compares six proven ways to prepare the data under the same conditions.",
    signal: "Fair comparison",
    value: "6 approaches",
  },
  {
    title: "Double-check the result",
    label: "Choose with confidence",
    description:
      "SOFIDR checks that the recommended option stays reliable when the data changes slightly.",
    signal: "Reliability check",
    value: "Checked twice",
  },
  {
    title: "Download your result",
    label: "Keep moving",
    description:
      "Review what changed, download an improved file, and save a report when you need one.",
    signal: "Ready to use",
    value: "File + report",
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
          From uploaded file to useful result.
        </h2>
        <p>
          SOFIDR explains each step in plain language, so you can see what happened
          to your data and why.
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
