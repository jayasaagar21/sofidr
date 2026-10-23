/**
 * One-line process / step definitions + analyst reasoning for the Dataset page.
 */

export interface CleaningLine {
  id: string
  process: string
  step: string
  reason: string
}

interface ProcessDef {
  process: string
  reason: string
}

const P = {
  ingest: {
    process: "Ingest tabular stream",
    reason: "A stable parse of the upload is the base every later metric depends on.",
  },
  profile: {
    process: "Profile dataset",
    reason: "Knowing missingness and field types first decides which repairs are safe.",
  },
  structural: {
    process: "Structural repair",
    reason: "Malformed rows and type noise block profiling before any tactic runs.",
  },
  trim: {
    process: "Trim whitespace",
    reason: "' Paid' and 'Paid' would otherwise count as two different values.",
  },
  sentinels: {
    process: "Normalize empty sentinels",
    reason: "NA / null / — must become true missing so fill rates and counts are honest.",
  },
  emptyCols: {
    process: "Drop empty columns",
    reason: "All-null columns add width with zero information and confuse BI tools.",
  },
  constantCols: {
    process: "Drop constant columns",
    reason: "A single repeated value carries no signal for comparison or modeling.",
  },
  duplicates: {
    process: "Remove exact duplicates",
    reason: "Repeated rows inflate volume KPIs and bias any frequency-based analysis.",
  },
  types: {
    process: "Cast field types",
    reason: "Numbers stored as text cannot be summed, averaged, or correlated.",
  },
  geo: {
    process: "Collapse geographic aliases",
    reason: "US / USA / United States must be one label or segments split falsely.",
  },
  temporal: {
    process: "Normalize temporal fields",
    reason: "Mixed date formats break time-series joins and period filters.",
  },
  format: {
    process: "Validate formats",
    reason: "Invalid emails inflate unique counts and break CRM matching.",
  },
  names: {
    process: "Standardize names",
    reason: "Case drift ('jane doe' vs 'Jane Doe') splits one person into several records.",
  },
  boolean: {
    process: "Normalize boolean labels",
    reason: "Y/N/true/false must share one encoding for rates and models.",
  },
  categories: {
    process: "Standardize categories",
    reason: "Case and synonym drift split the same business state into many buckets.",
  },
  aliases: {
    process: "Collapse value aliases",
    reason: "Fewer distinct labels prevents false category fragmentation in group-bys.",
  },
  bounds: {
    process: "Enforce domain bounds",
    reason: "Impossible values (e.g. age 300) distort averages and outlier detection.",
  },
  currency: {
    process: "Parse numeric / currency",
    reason: "'$1,200' as text cannot be aggregated; it must become a number.",
  },
  impute: {
    process: "Impute missing cells",
    reason: "Gaps break aggregates; median/mode fills restore coverage while flags keep it traceable.",
  },
  standardize: {
    process: "Standardize common fields",
    reason: "Consistent formats are required for grouping, filtering, and joins.",
  },
  export: {
    process: "Export cleaned CSV",
    reason: "Analysts need a portable artifact for BI tools and model pipelines.",
  },
} satisfies Record<string, ProcessDef>

const STEP_KEYS: Record<string, ProcessDef> = {
  streamed_local_read: P.ingest,
  streamed_file_read: P.ingest,
  delimiter_detection: P.ingest,
  structural_repair: P.structural,
  trim_whitespace: P.trim,
  normalise_missing_sentinels: P.sentinels,
  normalized_empty_sentinels: P.sentinels,
  sentinel_normalization: P.sentinels,
  drop_empty_columns: P.emptyCols,
  drop_constant_columns: P.constantCols,
  drop_duplicate_rows: P.duplicates,
  removed_duplicate_rows: P.duplicates,
  duplicate_hash_dedupe: P.duplicates,
  cast_types: P.types,
  canonicalized_country_aliases: P.geo,
  filled_missing_values: P.impute,
  missing_value_fill: P.impute,
  standardized_common_fields: P.standardize,
  built_browser_csv_export: P.export,
}

const TACTIC_KEYS: Record<string, ProcessDef> = {
  "understand dataset": P.profile,
  "structural repair (sofidr defensive)": P.structural,
  "temporal normalization": P.temporal,
  "format validation": P.format,
  "geographic synonym collapse": P.geo,
  "boolean synonym collapse": P.boolean,
  "categorical standardization": P.categories,
  "alias collapse": P.aliases,
  "domain bounds": P.bounds,
  "numeric / currency parse": P.currency,
  "imputation with indicators": P.impute,
  "imputation with retention": P.impute,
}

function humanize(step: string): string {
  return step.replace(/_/g, " ").replace(/\s+/g, " ").trim()
}

function matchStep(key: string): ProcessDef | null {
  if (STEP_KEYS[key]) return STEP_KEYS[key]
  if (/country|geo|nation/.test(key)) return P.geo
  if (/date|time|timestamp/.test(key)) return P.temporal
  if (/email|validat/.test(key)) return P.format
  if (/boolean/.test(key)) return P.boolean
  if (/bound/.test(key)) return P.bounds
  if (/currency|price|amount/.test(key)) return P.currency
  if (/alias|collaps/.test(key)) return P.aliases
  if (/categor|status/.test(key)) return P.categories
  if (/^standardized_.*name/.test(key)) return P.names
  if (/duplicate|dedupe/.test(key)) return P.duplicates
  if (/sentinel/.test(key)) return P.sentinels
  if (/impute|fill/.test(key)) return P.impute
  if (/standard/.test(key)) return P.standardize
  return null
}

/** Column token embedded in server step names like `standardized_category_status`. */
function stepDetail(key: string): string {
  const col = key
    .replace(/^(standardized_category_|standardized_|canonicalized_country_|normalized_boolean_|collapsed_aliases_|validated_|parsed_currency_|bounded_)/, "")
    .replace(/(_dates|_0_120)$/, "")
  return col && col !== key ? `Applied on ${humanize(col)}` : humanize(key)
}

export function describeCleaningStep(step: string, index: number): CleaningLine {
  const key = step.toLowerCase().replace(/\s+/g, "_")
  const hit = matchStep(key)
  return {
    id: `${key}-${index}`,
    process: hit?.process ?? "Apply cleaning tactic",
    step: hit ? stepDetail(key) : humanize(step),
    reason: hit?.reason ?? "Required to make this field analysis-ready for trustworthy aggregates.",
  }
}

export function buildCleaningLines(
  steps: string[],
  tactics?: { tactic: string; column: string; why: string }[]
): CleaningLine[] {
  const fromSteps = steps.map((step, index) => describeCleaningStep(step, index))
  if (!tactics?.length) return dedupe(fromSteps).slice(0, 16)

  const fromTactics: CleaningLine[] = tactics.map((t, index) => {
    const def = TACTIC_KEYS[t.tactic.toLowerCase()]
    const scope = t.column && t.column !== "(all)" ? `${t.column}: ` : ""
    return {
      id: `tactic-${index}`,
      process: def?.process ?? t.tactic,
      step: `${scope}${t.why}`,
      reason: def?.reason ?? t.why,
    }
  })

  const covered = new Set(fromTactics.map((l) => l.process))
  const extras = fromSteps.filter((l) => !covered.has(l.process))
  return dedupe([...extras, ...fromTactics])
    .map((line, i) => ({ line, i }))
    .sort((a, b) => rank(a.line.process) - rank(b.line.process) || a.i - b.i)
    .map(({ line }) => line)
    .slice(0, 16)
}

const PIPELINE_ORDER = Object.values(P).map((d) => d.process)

function rank(process: string): number {
  const i = PIPELINE_ORDER.indexOf(process)
  return i === -1 ? PIPELINE_ORDER.length - 1 : i
}

/** Steps without a column detail collapse to one line per process. */
function dedupe(lines: CleaningLine[]): CleaningLine[] {
  const seen = new Set<string>()
  return lines.filter((l) => {
    const k = `${l.process}|${l.step}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
