import React, { useEffect, useRef, useState } from "react"
import { Button } from "./ui/Button"

const stages = [
  {
    title: "Reconnaissance",
    label: "Map the terrain",
    description:
      "SOFIDR profiles class balance, missingness, dimensionality, and signal structure before changing the data.",
    signal: "Terrain profile",
    value: "4 conditions detected",
  },
  {
    title: "Formation comparison",
    label: "Test every strategy",
    description:
      "Eight preprocessing formations run against the same stratified folds so each comparison stays fair and leak-resistant.",
    signal: "Controlled trial",
    value: "8 formations × 3 folds",
  },
  {
    title: "SEI ranking",
    label: "Balance the tradeoffs",
    description:
      "The Strategic Efficiency Index weighs accuracy, stability, feature retention, and simplicity—not accuracy alone.",
    signal: "Leading score",
    value: "SEI 0.842",
  },
  {
    title: "Data enhancement",
    label: "Build model-ready output",
    description:
      "For uploaded CSVs, the winning formation is applied and returned as a downloadable, model-ready dataset.",
    signal: "Final artifact",
    value: "Enhanced CSV",
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
        <p className="eyebrow">Guided process demo</p>
        <h2 id="process-title" ref={headingRef} tabIndex={-1}>
          See how a dataset becomes a decision.
        </h2>
        <p>
          Step through SOFIDR’s evidence chain. Every recommendation is tied to
          measured terrain and a comparable validation result.
        </p>
      </div>

      <div className="process-shell">
        <ol className="process-steps" aria-label="SOFIDR process stages">
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
                  Next stage <span aria-hidden="true">→</span>
                </Button>
              ) : (
                <Button onClick={onChooseBenchmark}>
                  Choose a benchmark <span aria-hidden="true">↓</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
