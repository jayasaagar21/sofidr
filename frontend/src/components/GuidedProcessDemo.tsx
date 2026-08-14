import React, { useEffect, useRef, useState } from "react"
import { Button } from "./ui/Button"

const stages = [
  {
    title: "Reconnaissance",
    label: "Phase 0 — Map the terrain",
    description:
      "SOFIDR profiles dimensionality, missingness, class balance, and feature correlation before any formation is applied.",
    signal: "Terrain profile",
    value: "Algorithm 1 cold-start",
  },
  {
    title: "Multi-formation evaluation",
    label: "Phase 1 — Compare formations",
    description:
      "The six paper-defined formations are scored with the Strategic Efficiency Index on the same stratified folds.",
    signal: "Controlled trial",
    value: "Shared 3-fold SEI",
  },
  {
    title: "Iterative refinement",
    label: "Phase 2 — Stress the choice",
    description:
      "Controlled perturbations re-check robustness. A switch occurs only if an alternative beats the current SEI by more than 3%.",
    signal: "Adaptation rule",
    value: "Switch if >3% better",
  },
  {
    title: "Recommendation & enhancement",
    label: "Defendable output",
    description:
      "best_by_sei is the deterministic recommendation. For uploads, that formation can then produce a model-ready export.",
    signal: "Final artifact",
    value: "Formation + report",
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
          See how SOFIDR applies its strategy.
        </h2>
        <p>
          SOFIDR is fixed. What changes by dataset is terrain, formation ranking,
          technique mix inside that formation, and the measured outcome.
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
