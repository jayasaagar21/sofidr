/**
 * Client-side storytelling model for the Visualize report.
 * Aligns with SOFIDR paper phases, SEI weights, and Table 1 formations.
 */

import {
  CleanResponse,
  DatasetProfile,
  FormationResult,
  OptimizeResponse,
} from "../api"

export const SEI_WEIGHTS = {
  accuracy: 0.4,
  stability: 0.25,
  retention: 0.2,
  simplicity: 0.15,
} as const

export const PAPER_PHASES = [
  "Understand the data",
  "Compare the options",
  "Double-check the result",
] as const

export const FORMATION_TABLE: Record<
  string,
  {
    imputation: string
    outlier: string
    featureSelect: string
    decomposition: string
    scaling: string
    terrain: string
  }
> = {
  phalanx: {
    imputation: "Median",
    outlier: "IQR (1.5×)",
    featureSelect: "No",
    decomposition: "No",
    scaling: "Yes",
    terrain: "General-purpose, moderate missingness",
  },
  skirmisher: {
    imputation: "Mean",
    outlier: "None",
    featureSelect: "Yes (k=10)",
    decomposition: "No",
    scaling: "Yes",
    terrain: "High-dimensional data (d/n > 0.1)",
  },
  heavy_cavalry: {
    imputation: "Median",
    outlier: "Z-score (3σ)",
    featureSelect: "No",
    decomposition: "PCA (5)",
    scaling: "Yes",
    terrain: "Highly correlated features",
  },
  guerrilla: {
    imputation: "Most frequent",
    outlier: "None",
    featureSelect: "No",
    decomposition: "No",
    scaling: "Yes (+ SMOTE)",
    terrain: "Imbalanced classes (balance < 0.5)",
  },
  scorched_earth: {
    imputation: "Median",
    outlier: "IQR (1.5×)",
    featureSelect: "Yes (k=10)",
    decomposition: "PCA (5)",
    scaling: "Yes",
    terrain: "Maximum preprocessing (aggressive)",
  },
  reconnaissance: {
    imputation: "Mean",
    outlier: "None",
    featureSelect: "No",
    decomposition: "No",
    scaling: "No",
    terrain: "Clean data, minimal intervention",
  },
}

export interface StoryInsight {
  title: string
  detail: string
  impact: "high" | "medium" | "supporting"
}

export interface StoryAction {
  title: string
  detail: string
  owner: string
}

export interface StoryReport {
  title: string
  subtitle: string
  problem: {
    statement: string
    message: string
    terrainTags: string[]
    terrainMetrics: { label: string; value: number; hint: string }[]
    qualityLabel?: string
    qualityScore?: number
    topIssues: { label: string; severity: string; pct: number; impact: string }[]
  }
  changes?: {
    summary: string
    metrics: { label: string; value: string }[]
    steps: string[]
  }
  selection: {
    formation: string
    coldStart: string
    reason: string
    paperTerrain: string
    techniques: string[]
    sei: number | null
    components: { key: string; label: string; value: number; weight: number }[]
    scoreboard: FormationResult[]
  } | null
  verification: {
    winner: string
    deltaSei: number | null
    sofidrSei: number | null
    conventionalLabel: string | null
    conventionalSei: number | null
    phases: string[]
  } | null
  insights: StoryInsight[]
  actions: StoryAction[]
  narrative: string
}

function pretty(name: string): string {
  return name.replace(/_/g, " ")
}

function terrainHints(key: string): string {
  const map: Record<string, string> = {
    missing_rate: "Share of empty cells — drives imputation choice",
    dim_ratio: "Features per row — high values favor feature selection",
    balance: "Minority/majority class ratio — low values need imbalance handling",
    corr_max: "Strongest feature correlation — high values favor PCA-style steps",
    n_rows: "Dataset scale",
    n_cols: "Feature width",
  }
  return map[key] || "Terrain signal used by Algorithm 1 cold-start"
}

export function buildStoryReport(input: {
  optimize?: OptimizeResponse | null
  profile?: DatasetProfile | null
  cleaning?: CleanResponse | null
  sourceName?: string
}): StoryReport {
  const { optimize, profile, cleaning, sourceName } = input
  const name = sourceName || optimize?.dataset_name || "Uploaded dataset"
  const target = optimize?.target_column

  const topIssues =
    profile?.issues.slice(0, 6).map((issue) => ({
      label: `${issue.issue}${issue.column && issue.column !== "(all columns)" ? ` · ${issue.column}` : ""}`,
      severity: issue.severity,
      pct: issue.percentage_affected,
      impact: issue.potential_impact,
    })) || []

  const terrainEntries = Object.entries(optimize?.terrain || {})
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([key, value]) => ({
      label: pretty(key),
      value: value as number,
      hint: terrainHints(key),
    }))

  const problemStatement = target
    ? `Leaders need a reliable way to prepare “${name}” so that predictions of “${target}” stay accurate, stable, and explainable — without silently damaging the underlying records.`
    : `This dataset needs to be trustworthy before anyone uses it for reporting or decisions. SOFIDR scanned “${name}” for structural risk and prepared a cleaner, decision-ready version.`

  const messageParts: string[] = []
  if (profile) {
    messageParts.push(
      `Overall quality is ${profile.quality.label.toLowerCase()} (${profile.quality.score}/100) across ${profile.dataset.rows.toLocaleString()} rows and ${profile.dataset.columns} columns.`
    )
  }
  if (topIssues.length) {
    const critical = topIssues.filter((i) => i.severity === "Critical" || i.severity === "High")
    messageParts.push(
      critical.length
        ? `The loudest risks are ${critical
            .slice(0, 2)
            .map((i) => i.label.toLowerCase())
            .join(" and ")} — these distort totals, models, and forecasts if left alone.`
        : `Issues are present but mostly moderate; cleaning still improves completeness and consistency.`
    )
  } else if (optimize?.terrain_tags?.length) {
    messageParts.push(
      `Terrain signals (${optimize.terrain_tags.join(", ")}) tell SOFIDR which preparation formation fits before any model is trusted.`
    )
  } else {
    messageParts.push(
      "The file carries operational history. Cleaning and optional strategy comparison turn raw rows into a story the business can act on."
    )
  }

  let changes: StoryReport["changes"]
  if (cleaning) {
    const m = cleaning.metadata
    changes = {
      summary:
        m.processingMode === "local"
          ? "Optional repair path: the full file was scanned and cleaned in this browser session for scale."
          : "Optional repair path: structural fixes and field normalization were applied in this session only.",
      metrics: [
        {
          label: "Shape",
          value: `${(m.before.rows ?? 0).toLocaleString()} → ${(m.after.rows ?? 0).toLocaleString()} rows`,
        },
        { label: "Duplicates removed", value: m.duplicatesRemoved.toLocaleString() },
        { label: "Missing cells filled", value: m.missingFilled.toLocaleString() },
        {
          label: "Completeness",
          value:
            m.completenessBefore != null && m.completenessAfter != null
              ? `${m.completenessBefore}% → ${m.completenessAfter}%`
              : "—",
        },
      ],
      steps: m.steps.map((s) => pretty(s)),
    }
  }

  let selection: StoryReport["selection"] = null
  if (optimize) {
    const best = optimize.scoreboard.find((s) => s.name === optimize.best_by_sei)
    const table = FORMATION_TABLE[optimize.best_by_sei]
    const techniques =
      optimize.research?.selected_formation?.techniques?.map((t) => t.technique) ||
      (table
        ? [
            `${table.imputation} imputation`,
            table.outlier !== "None" ? `${table.outlier} outliers` : "No outlier cull",
            table.featureSelect !== "No" ? `Feature select (${table.featureSelect})` : "Keep full feature set",
            table.decomposition !== "No" ? table.decomposition : "No decomposition",
            table.scaling === "No" ? "No scaling" : "Scaled features",
          ]
        : [])

    selection = {
      formation: optimize.best_by_sei,
      coldStart: optimize.cold_start_default,
      reason: optimize.selection_reason,
      paperTerrain: table?.terrain || optimize.research?.selected_formation?.target_terrain || "Paper-aligned terrain",
      techniques,
      sei: best?.sei ?? null,
      components: best
        ? [
            { key: "accuracy", label: "Accuracy", value: best.accuracy, weight: SEI_WEIGHTS.accuracy },
            { key: "stability", label: "Stability", value: best.stability, weight: SEI_WEIGHTS.stability },
            { key: "retention", label: "Retention", value: best.retention, weight: SEI_WEIGHTS.retention },
            { key: "simplicity", label: "Simplicity", value: best.simplicity, weight: SEI_WEIGHTS.simplicity },
          ]
        : [],
      scoreboard: [...optimize.scoreboard].sort((a, b) => b.sei - a.sei),
    }
  }

  let verification: StoryReport["verification"] = null
  if (optimize?.benchmark) {
    verification = {
      winner: optimize.benchmark.winner,
      deltaSei: optimize.benchmark.delta_sei,
      sofidrSei: optimize.benchmark.sofidr.sei,
      conventionalLabel: optimize.benchmark.conventional?.label || null,
      conventionalSei: optimize.benchmark.conventional?.sei ?? null,
      phases: optimize.research?.source?.phases || [...PAPER_PHASES],
    }
  } else if (optimize) {
    verification = {
      winner: optimize.best_by_sei,
      deltaSei: null,
      sofidrSei: selection?.sei ?? null,
      conventionalLabel: null,
      conventionalSei: null,
      phases: optimize.research?.source?.phases || [...PAPER_PHASES],
    }
  }

  const insights = deriveInsights({ optimize, profile, cleaning, selection, verification })
  const actions = deriveActions({ optimize, profile, cleaning, selection })

  return {
    title: `Visual story · ${name}`,
    subtitle: target
      ? `From problem to decision for predicting “${target}”`
      : "From problem to a cleaned, decision-ready dataset",
    problem: {
      statement: problemStatement,
      message: messageParts.join(" "),
      terrainTags: optimize?.terrain_tags || [],
      terrainMetrics: terrainEntries,
      qualityLabel: profile?.quality.label,
      qualityScore: profile?.quality.score,
      topIssues,
    },
    changes,
    selection,
    verification,
    insights,
    actions,
    narrative: optimize?.report || "",
  }
}

function deriveInsights(ctx: {
  optimize?: OptimizeResponse | null
  profile?: DatasetProfile | null
  cleaning?: CleanResponse | null
  selection: StoryReport["selection"]
  verification: StoryReport["verification"]
}): StoryInsight[] {
  const insights: StoryInsight[] = []
  const { optimize, profile, cleaning, selection, verification } = ctx

  if (selection) {
    const best = selection.scoreboard[0]
    const runner = selection.scoreboard[1]
    insights.push({
      title: `“${pretty(selection.formation)}” is the preparation the business should standardize`,
      detail: runner
        ? `It leads on Strategic Efficiency Index (SEI ${best.sei.toFixed(3)}) versus ${pretty(runner.name)} (${runner.sei.toFixed(3)}). SEI blends accuracy (40%), stability (25%), retention (20%), and simplicity (15%) — the paper’s decision metric — so this is not a single-score vanity pick.`
        : `Selected by SEI using the paper weights (accuracy 40%, stability 25%, retention 20%, simplicity 15%).`,
      impact: "high",
    })

    if (selection.coldStart && selection.coldStart !== selection.formation) {
      insights.push({
        title: "Cold-start intuition was challenged — and that is useful",
        detail: `Algorithm 1 first suggested ${pretty(selection.coldStart)} from terrain rules, but the fair scoreboard preferred ${pretty(selection.formation)}. Treat the scoreboard as the governance check before locking a production pipeline.`,
        impact: "high",
      })
    } else if (selection.coldStart) {
      insights.push({
        title: "Terrain rules and the scoreboard agree",
        detail: `Algorithm 1 cold-start (${pretty(selection.coldStart)}) matches the SEI winner. That alignment raises confidence that the formation fits this data’s shape, not just a lucky fold.`,
        impact: "medium",
      })
    }

    const acc = selection.components.find((c) => c.key === "accuracy")
    const stab = selection.components.find((c) => c.key === "stability")
    if (acc && stab) {
      insights.push({
        title:
          stab.value + 0.02 < acc.value
            ? "Accuracy looks strong, but stability needs watching"
            : "Accuracy and stability move together",
        detail:
          stab.value + 0.02 < acc.value
            ? `Stability (${stab.value.toFixed(3)}) trails accuracy (${acc.value.toFixed(3)}). Before betting budget on the model, re-check with a holdout month or a second site — brittle pipelines create silent operational risk.`
            : `Stability (${stab.value.toFixed(3)}) keeps pace with accuracy (${acc.value.toFixed(3)}), which supports rolling this preparation into recurring decisions rather than one-off analyses.`,
        impact: "high",
      })
    }

    insights.push({
      title: `Why this formation fits the paper’s terrain`,
      detail: `${pretty(selection.formation)} targets “${selection.paperTerrain}”. Techniques in play: ${selection.techniques.slice(0, 4).join("; ")}. Use this as the documented “why” when stakeholders ask why the data was prepared this way.`,
      impact: "medium",
    })
  }

  if (verification?.deltaSei != null && verification.conventionalLabel) {
    const ahead = verification.deltaSei >= 0
    insights.push({
      title: ahead
        ? "SOFIDR beats the conventional baseline on the same folds"
        : "Conventional baseline is competitive — investigate before switching",
      detail: ahead
        ? `Delta SEI is +${verification.deltaSei.toFixed(4)} versus ${verification.conventionalLabel}. That gap is the business case for adopting the recommended formation instead of a one-size-fits-all scrub.`
        : `Delta SEI is ${verification.deltaSei.toFixed(4)} versus ${verification.conventionalLabel}. Do not discard SOFIDR yet — inspect which SEI component lost, then decide whether to keep the formation for retention/simplicity trade-offs.`,
      impact: "high",
    })
  }

  if (profile) {
    const completeness = profile.quality.dimensions.completeness
    if (typeof completeness === "number") {
      insights.push({
        title:
          completeness < 90
            ? "Incomplete records are still a decision risk"
            : "Completeness supports trustworthy aggregates",
        detail:
          completeness < 90
            ? `Completeness sits at ${completeness.toFixed(1)}%. Dashboards and forecasts built on partial fields will understate volume or overstate rates — prioritize the top issue columns before executive reporting.`
            : `Completeness is ${completeness.toFixed(1)}%. Totals and rates from this file are safer to socialize, provided duplicate and outlier checks remain in the pipeline.`,
        impact: completeness < 90 ? "high" : "supporting",
      })
    }
    if (profile.correlations?.length) {
      const top = profile.correlations[0]
      insights.push({
        title: "Feature overlap can double-count the same story",
        detail: `Strongest link: ${top.left} ↔ ${top.right} (|r|=${top.absolute_correlation.toFixed(2)}). Correlated drivers can inflate confidence in a “multi-factor” narrative that is really one signal — prefer the formation’s decomposition/selection steps when explaining drivers to leadership.`,
        impact: "medium",
      })
    }
  }

  if (cleaning) {
    const m = cleaning.metadata
    if (m.duplicatesRemoved > 0 || m.missingFilled > 0) {
      insights.push({
        title: "Raw operational extracts were not analysis-ready",
        detail: `Cleaning removed ${m.duplicatesRemoved.toLocaleString()} duplicate rows and filled ${m.missingFilled.toLocaleString()} empty cells. Any KPI built on the pre-clean file was likely inflated or incomplete — republish numbers from the cleaned download.`,
        impact: "high",
      })
    }
  }

  if (!insights.length) {
    insights.push({
      title: "Start with a clean baseline, then compare strategies",
      detail:
        "Run cleaning to expose structural risk, then compare formations when you have a category to predict. Insights deepen once SEI scoreboard and terrain signals are available.",
      impact: "medium",
    })
  }

  return insights.slice(0, 7)
}

function deriveActions(ctx: {
  optimize?: OptimizeResponse | null
  profile?: DatasetProfile | null
  cleaning?: CleanResponse | null
  selection: StoryReport["selection"]
}): StoryAction[] {
  const actions: StoryAction[] = []
  const { optimize, profile, cleaning, selection } = ctx

  if (cleaning) {
    actions.push({
      title: "Replace the working extract with the cleaned download",
      detail:
        "Point dashboards, CRM loads, and ad-hoc models at the SOFIDR cleaned file so teams stop debating numbers from conflicting raw dumps.",
      owner: "Data / Analytics owner",
    })
  }

  if (selection) {
    actions.push({
      title: `Lock “${pretty(selection.formation)}” as the default preparation for this use case`,
      detail: `Document the SEI score (${selection.sei?.toFixed(3) ?? "—"}) and paper terrain (“${selection.paperTerrain}”) in your data prep runbook so future refreshes stay comparable.`,
      owner: "ML / Analytics lead",
    })
    actions.push({
      title: "Schedule a stability re-check on the next data cut",
      detail:
        "Re-run SOFIDR when a new month/site lands. If the winner flips, treat it as a change-control event — not an invisible pipeline drift.",
      owner: "Ops / Quality",
    })
  } else if (profile?.dataset.potential_target_fields?.length) {
    actions.push({
      title: "Run “Compare options” on a category you care about",
      detail: `Suggested fields: ${profile.dataset.potential_target_fields.slice(0, 3).join(", ")}. That unlocks formation selection, SEI charts, and decision-grade insights.`,
      owner: "Business stakeholder + analyst",
    })
  }

  if (profile?.issues.some((i) => i.severity === "Critical" || i.severity === "High")) {
    const top = profile.issues.find((i) => i.severity === "Critical" || i.severity === "High")
    actions.push({
      title: `Fix upstream capture for “${top?.column || "priority fields"}”`,
      detail:
        "Cleaning can fill gaps, but durable decisions need the source system to stop producing Critical/High missingness. Open a ticket with the system owner.",
      owner: "Source system owner",
    })
  }

  if (optimize?.target_column) {
    actions.push({
      title: `Pilot a decision rule on “${optimize.target_column}” using the prepared data`,
      detail:
        "Take the cleaned + formation-prepared table into a limited pilot (one team or one region). Measure lift versus the previous process before full rollout.",
      owner: "Business decision owner",
    })
  }

  actions.push({
    title: "Share the visual story, not the raw file, with stakeholders",
    detail:
      "Use the shareable summary and this Visualize report so leadership sees problem → method → insight → action without receiving sensitive row-level data.",
    owner: "Project lead",
  })

  return actions.slice(0, 6)
}
