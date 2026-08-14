import React from "react"

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
    high_dimensional: { title: "Many columns", meta: "More columns than usual" },
    imbalanced: { title: "Uneven categories", meta: "85:15 category split" },
    noisy_missing: { title: "Missing values", meta: "8% of cells are blank" },
    correlated: { title: "Similar columns", meta: "20 overlapping signals" },
  }

  return (
    <div className="archetype-selector">
      <div className="panel-heading">
        <div>
          <p className="option-label">Option 2</p>
          <h3>Explore a benchmark</h3>
          <p>Try a prepared example to see what SOFIDR finds and improves.</p>
        </div>
      </div>
      <div className="archetype-grid">
        {Object.entries(archetypes).map(([key, desc], index) => (
          <button
            key={key}
            type="button"
            ref={index === 0 ? firstButtonRef : undefined}
            className="card archetype-card"
            onClick={() => onSelect(key)}
            disabled={loading}
            aria-label={`Explore ${labels[key]?.title || key.replace(/_/g, " ")} example`}
          >
            <span className="archetype-meta">{labels[key]?.meta || "Benchmark dataset"}</span>
            <h4>{labels[key]?.title || key.replace(/_/g, " ")}</h4>
            <p>{desc}</p>
          </button>
        ))}
        {!Object.keys(archetypes).length && !loading && (
          <p className="empty-state">Benchmark datasets are temporarily unavailable.</p>
        )}
      </div>
    </div>
  )
}
