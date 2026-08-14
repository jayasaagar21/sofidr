import React, { useState } from "react"
import { DatasetProfile } from "../api"
import { Card } from "./ui/Card"

interface DatasetProfileDisplayProps {
  profile: DatasetProfile
}

export default function DatasetProfileDisplay({ profile }: DatasetProfileDisplayProps) {
  const [showColumns, setShowColumns] = useState(false)
  const issues = profile.issues.slice(0, 6)
  const dimensions = Object.entries(profile.quality.dimensions)

  return (
    <section className="dataset-profile" aria-labelledby="profile-heading">
      <div className="analysis-section-heading">
        <div>
          <p className="eyebrow">Dataset intelligence</p>
          <h2 id="profile-heading">Scan before strategy</h2>
          <p>{profile.strategy_context.detail}</p>
        </div>
        <span className="quality-badge" title={profile.quality.method}>
          {profile.quality.score}/100 · {profile.quality.label}
        </span>
      </div>

      <div className="profile-grid">
        <Card className="profile-card">
          <span className="detail-label">Dataset overview</span>
          <dl className="profile-facts">
            <div><dt>Shape</dt><dd>{profile.dataset.rows.toLocaleString()} rows × {profile.dataset.columns} columns</dd></div>
            <div><dt>Format</dt><dd>{profile.source_format.toUpperCase()}</dd></div>
            <div><dt>Classification</dt><dd>{profile.dataset.classification.name}</dd></div>
            <div><dt>Fingerprint</dt><dd><code>{profile.dataset.input_fingerprint}</code></dd></div>
          </dl>
        </Card>
        <Card className="profile-card">
          <span className="detail-label">Quality dimensions</span>
          <div className="quality-dimensions">
            {dimensions.map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>{value.toFixed(1)}%</strong>
                <i aria-hidden="true"><b style={{ width: `${value}%` }} /></i>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="issue-card">
        <div className="issue-heading">
          <div>
            <span className="detail-label">Prioritized conditions</span>
            <p>Priority is calculated from issue impact, field importance, and field role.</p>
          </div>
          <span className="method-note">{profile.priority_formula}</span>
        </div>
        {issues.length ? (
          <div className="issue-table-wrap">
            <table className="issue-table">
              <caption className="sr-only">Prioritized dataset conditions</caption>
              <thead><tr><th>Condition</th><th>Field</th><th>Affected</th><th>Severity</th><th>Priority</th></tr></thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={`${issue.issue}-${issue.column}`}>
                    <td><strong>{issue.issue}</strong><small>{issue.potential_impact}</small></td>
                    <td>{issue.column}</td>
                    <td>{issue.records_affected.toLocaleString()} ({issue.percentage_affected.toFixed(1)}%)</td>
                    <td><span className={`severity severity-${issue.severity.toLowerCase()}`}>{issue.severity}</span></td>
                    <td>{issue.priority_score}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty-state">No measured quality conditions require treatment.</p>}
      </Card>

      <div className="profile-actions">
        <p>
          Potential target fields: {profile.dataset.potential_target_fields.length
            ? profile.dataset.potential_target_fields.join(", ")
            : "none inferred"}
        </p>
        <button type="button" className="text-button" onClick={() => setShowColumns((visible) => !visible)}>
          {showColumns ? "Hide column detail" : `Inspect ${profile.columns.length} columns`}
        </button>
      </div>
      {showColumns && (
        <Card className="column-profile-card">
          <div className="issue-table-wrap">
            <table className="issue-table">
              <caption className="sr-only">Column-level dataset profile</caption>
              <thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Unique</th><th>Extremes</th><th>Notes</th></tr></thead>
              <tbody>{profile.columns.map((column) => (
                <tr key={column.name}>
                  <td>{column.name}</td><td>{column.role}</td>
                  <td>{column.n_missing} ({column.pct_missing.toFixed(1)}%)</td>
                  <td>{column.n_unique} ({column.pct_unique.toFixed(1)}%)</td>
                  <td>{column.n_extreme}</td>
                  <td>{column.notes.join("; ") || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  )
}
