import React from "react"
import { Button } from "./ui/Button"
import { Card } from "./ui/Card"

interface ArchetypeSelectorProps {
  archetypes: Record<string, string>
  loading: boolean
  onSelect: (archetype: string) => void
  firstButtonRef?: React.RefObject<HTMLButtonElement>
}

export default function ArchetypeSelector({
  archetypes,
  loading,
  onSelect,
  firstButtonRef,
}: ArchetypeSelectorProps) {
  const labels: Record<string, { title: string; meta: string }> = {
    breast_cancer: { title: "Clinical diagnosis", meta: "Balanced · 30 features" },
    high_dimensional: { title: "High dimensional", meta: "Feature-heavy terrain" },
    imbalanced: { title: "Imbalanced classes", meta: "85:15 class split" },
    noisy_missing: { title: "Missing values", meta: "8% incomplete cells" },
    correlated: { title: "Correlated features", meta: "20 redundant signals" },
  }

  return (
    <div className="archetype-selector">
      <div className="panel-heading">
        <span className="step-number">01</span>
        <div>
          <h3>Explore a benchmark</h3>
          <p>Run a prepared dataset to see how SOFIDR reasons.</p>
        </div>
      </div>
      <div className="archetype-grid">
        {Object.entries(archetypes).map(([key, desc], index) => (
          <Card key={key} className="archetype-card">
            <div>
              <span className="archetype-meta">{labels[key]?.meta || "Benchmark dataset"}</span>
              <h4>{labels[key]?.title || key.replace(/_/g, " ")}</h4>
              <p>{desc}</p>
            </div>
            <Button
              ref={index === 0 ? firstButtonRef : undefined}
              onClick={() => onSelect(key)}
              disabled={loading}
              className="w-full"
            >
              Run analysis <span aria-hidden="true">→</span>
            </Button>
          </Card>
        ))}
        {!Object.keys(archetypes).length && !loading && (
          <p className="empty-state">Benchmark datasets are temporarily unavailable.</p>
        )}
      </div>
    </div>
  )
}
