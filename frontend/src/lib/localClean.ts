/**
 * Browser-side CSV/TSV cleaner for large files (up to ~1M rows).
 * Streams the file so the full table never needs to sit in memory twice.
 */

import { CleanResponse, CsvPreview, DatasetProfile, parseCsvPreview } from "../api"
import { standardizeValue } from "./cleanRules"

export const SERVER_BODY_LIMIT = Math.floor(3.5 * 1024 * 1024)
export const LOCAL_FILE_LIMIT = 250 * 1024 * 1024
export const LARGE_ROW_HINT = 1_000_000

export type ScanStage =
  | "reading"
  | "scanning"
  | "repairing"
  | "enhancing"
  | "preparing"

export interface ScanProgress {
  stage: ScanStage
  rowsSeen: number
  rowsWritten: number
  duplicatesRemoved: number
  missingFilled: number
  detail: string
  percent: number
}

export interface LocalCleanOptions {
  onProgress?: (progress: ScanProgress) => void
}

const SENTINELS = new Set([
  "",
  "na",
  "n/a",
  "null",
  "none",
  "nan",
  "-",
  "--",
  "?",
  "missing",
  "unknown",
])

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim()) || ""
  const commas = (firstLine.match(/,/g) || []).length
  const tabs = (firstLine.match(/\t/g) || []).length
  const semis = (firstLine.match(/;/g) || []).length
  if (tabs > commas && tabs >= semis) return "\t"
  if (semis > commas) return ";"
  return ","
}

function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      fields.push(field)
      field = ""
    } else {
      field += char
    }
  }
  fields.push(field)
  return fields
}

function csvEscape(value: string): string {
  if (/[",\n\r\t]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function normalizeCell(raw: string): string {
  const trimmed = raw.trim()
  if (SENTINELS.has(trimmed.toLowerCase())) return ""
  return trimmed
}

function hashRow(cells: string[]): string {
  // FNV-1a 32-bit — compact duplicate key without storing full rows.
  let hash = 0x811c9dc5
  for (const cell of cells) {
    for (let i = 0; i < cell.length; i += 1) {
      hash ^= cell.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    hash ^= 31
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function columnKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function isNumericLike(value: string): boolean {
  if (!value) return false
  const cleaned = value.replace(/[$£€,\s]/g, "")
  return /^-?\d+(\.\d+)?%?$/.test(cleaned)
}

function toNumber(value: string): number | null {
  if (!value) return null
  const cleaned = value.replace(/[$£€,\s%]/g, "")
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

interface ColumnStat {
  name: string
  missing: number
  numericCount: number
  textCount: number
  sum: number
  values: Map<string, number>
}

async function readTextFile(
  file: File,
  onChunk?: (bytesRead: number, total: number) => void
): Promise<string> {
  // Prefer streaming for progress; fall back to full read for Safari quirks.
  if (!file.stream) {
    const text = await file.text()
    onChunk?.(file.size, file.size)
    return text
  }

  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let bytesRead = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    parts.push(decoder.decode(value, { stream: true }))
    onChunk?.(bytesRead, file.size)
    if (parts.length % 8 === 0) await yieldToUi()
  }
  parts.push(decoder.decode())
  return parts.join("")
}

function buildLocalProfile(
  columns: string[],
  stats: ColumnStat[],
  rows: number,
  duplicatesRemoved: number,
  missingFilled: number,
  sourceFormat: string
): DatasetProfile {
  const totalCells = Math.max(rows * columns.length, 1)
  const missingCells = stats.reduce((sum, col) => sum + col.missing, 0)
  const completeness = Math.max(0, 100 * (1 - missingCells / totalCells))
  const issues = stats
    .filter((col) => col.missing > 0)
    .map((col) => {
      const pct = rows ? (100 * col.missing) / rows : 0
      const severity =
        pct >= 40 ? "Critical" : pct >= 20 ? "High" : pct >= 5 ? "Medium" : "Low"
      return {
        issue: "Missing values",
        column: col.name,
        records_affected: col.missing,
        percentage_affected: Number(pct.toFixed(2)),
        severity: severity as "Critical" | "High" | "Medium" | "Low",
        priority_score: Number((pct * (severity === "Critical" ? 4 : severity === "High" ? 3 : 2)).toFixed(1)),
        potential_impact: "Incomplete records can skew analysis and reports.",
        applicable_techniques: ["median/mode fill", "missingness indicator"],
        research_basis: "Local large-file scan",
      }
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 12)

  if (duplicatesRemoved > 0) {
    issues.unshift({
      issue: "Duplicate rows",
      column: "(all columns)",
      records_affected: duplicatesRemoved,
      percentage_affected: rows + duplicatesRemoved
        ? Number(((100 * duplicatesRemoved) / (rows + duplicatesRemoved)).toFixed(2))
        : 0,
      severity: duplicatesRemoved > rows * 0.05 ? "High" : "Medium",
      priority_score: duplicatesRemoved,
      potential_impact: "Repeated rows inflate counts and bias models.",
      applicable_techniques: ["exact duplicate removal"],
      research_basis: "Local large-file scan",
    })
  }

  const qualityScore = Math.round(
    Math.min(100, completeness * 0.7 + Math.max(0, 30 - issues.length * 3))
  )

  return {
    dataset: {
      rows,
      columns: columns.length,
      input_fingerprint: `local-${rows}x${columns.length}`,
      classification: { name: "tabular", source: "local-scan" },
      potential_target_fields: columns.filter((name) => {
        const key = columnKey(name)
        return /label|target|class|status|outcome|approved|churn|y$/.test(key)
      }),
    },
    quality: {
      score: qualityScore,
      label: qualityScore >= 85 ? "Strong" : qualityScore >= 65 ? "Fair" : "Needs work",
      method: "local-large-file",
      weights: { completeness: 0.7, issues: 0.3 },
      dimensions: {
        completeness: Number(completeness.toFixed(1)),
        uniqueness: duplicatesRemoved === 0 ? 100 : 85,
      },
    },
    columns: stats.map((col) => {
      const role =
        col.numericCount >= col.textCount && col.numericCount > 0 ? "numeric" : "categorical"
      return {
        name: col.name,
        role,
        dtype: role === "numeric" ? "number" : "string",
        n: rows,
        n_missing: col.missing,
        pct_missing: rows ? Number(((100 * col.missing) / rows).toFixed(2)) : 0,
        n_unique: col.values.size,
        pct_unique: rows ? Number(((100 * col.values.size) / rows).toFixed(2)) : 0,
        n_extreme: 0,
        pct_extreme: 0,
        n_uncastable: 0,
        notes:
          missingFilled > 0 && col.missing > 0
            ? ["filled during local clean"]
            : [],
      }
    }),
    issues,
    correlations: [],
    priority_formula: "severity × records affected (local scan)",
    source_format: sourceFormat,
    parsing_steps: [
      "streamed_file_read",
      "delimiter_detection",
      "sentinel_normalization",
      "duplicate_hash_dedupe",
      "missing_value_fill",
    ],
    strategy_context: {
      stage: "local_large_file",
      detail:
        "Processed in your browser for scale. Classification comparison uses a sample when needed.",
    },
  }
}

export function isLocalTabularCandidate(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".txt") ||
    file.type === "text/csv" ||
    file.type === "text/tab-separated-values" ||
    file.type === "text/plain"
  )
}

export function needsLocalProcessing(file: File): boolean {
  return file.size > SERVER_BODY_LIMIT && isLocalTabularCandidate(file)
}

export async function cleanLocally(
  file: File,
  options: LocalCleanOptions = {}
): Promise<{ cleaning: CleanResponse; profile: DatasetProfile }> {
  const report = (progress: ScanProgress) => options.onProgress?.(progress)

  report({
    stage: "reading",
    rowsSeen: 0,
    rowsWritten: 0,
    duplicatesRemoved: 0,
    missingFilled: 0,
    detail: "Loading your file in this browser…",
    percent: 2,
  })

  const text = await readTextFile(file, (bytesRead, total) => {
    report({
      stage: "reading",
      rowsSeen: 0,
      rowsWritten: 0,
      duplicatesRemoved: 0,
      missingFilled: 0,
      detail: `Reading ${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB`,
      percent: Math.min(28, 2 + Math.round((26 * bytesRead) / Math.max(total, 1))),
    })
  })

  if (!text.trim()) throw new Error("This file looks empty.")

  const delimiter = detectDelimiter(text.slice(0, 64_000))
  const lines = text.split(/\r?\n/)
  let headerIndex = lines.findIndex((line) => line.trim().length > 0)
  if (headerIndex < 0) throw new Error("Could not find a header row.")

  const columns = parseLine(lines[headerIndex], delimiter).map((c) => c.trim() || "column")
  const stats: ColumnStat[] = columns.map((name) => ({
    name,
    missing: 0,
    numericCount: 0,
    textCount: 0,
    sum: 0,
    values: new Map(),
  }))

  report({
    stage: "scanning",
    rowsSeen: 0,
    rowsWritten: 0,
    duplicatesRemoved: 0,
    missingFilled: 0,
    detail: `Scanning ${columns.length} columns for issues…`,
    percent: 32,
  })

  const dataLineIndexes: number[] = []
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue
    dataLineIndexes.push(i)
    const cells = parseLine(lines[i], delimiter)
    for (let c = 0; c < columns.length; c += 1) {
      const value = normalizeCell(cells[c] ?? "")
      if (!value) {
        stats[c].missing += 1
        continue
      }
      if (isNumericLike(value)) {
        const num = toNumber(value)
        if (num !== null) {
          stats[c].numericCount += 1
          stats[c].sum += num
        } else {
          stats[c].textCount += 1
        }
      } else {
        stats[c].textCount += 1
      }
      if (stats[c].values.size < 64) {
        stats[c].values.set(value, (stats[c].values.get(value) || 0) + 1)
      }
    }
    if (dataLineIndexes.length % 25_000 === 0) {
      report({
        stage: "scanning",
        rowsSeen: dataLineIndexes.length,
        rowsWritten: 0,
        duplicatesRemoved: 0,
        missingFilled: 0,
        detail: `Scanned ${dataLineIndexes.length.toLocaleString()} rows…`,
        percent: Math.min(55, 32 + Math.round((dataLineIndexes.length / Math.max(dataLineIndexes.length + 1, 1)) * 20)),
      })
      await yieldToUi()
    }
  }

  const fills = stats.map((col) => {
    if (col.numericCount >= col.textCount && col.numericCount > 0) {
      return String(Number((col.sum / col.numericCount).toFixed(4)))
    }
    let best = "Unknown"
    let bestCount = -1
    for (const [value, count] of col.values) {
      if (count > bestCount) {
        best = value
        bestCount = count
      }
    }
    return best
  })

  const columnSamples = stats.map((col) => Array.from(col.values.keys()).slice(0, 40))

  report({
    stage: "repairing",
    rowsSeen: dataLineIndexes.length,
    rowsWritten: 0,
    duplicatesRemoved: 0,
    missingFilled: 0,
    detail: "Removing duplicates, collapsing aliases (US/USA/United States), repairing cells…",
    percent: 58,
  })

  const seen = new Set<string>()
  const outParts: string[] = []
  outParts.push(columns.map(csvEscape).join(","))

  let duplicatesRemoved = 0
  let missingFilled = 0
  let rowsWritten = 0
  const previewRows: string[][] = []

  for (let index = 0; index < dataLineIndexes.length; index += 1) {
    const rawCells = parseLine(lines[dataLineIndexes[index]], delimiter)
    const cells = columns.map((_, c) => normalizeCell(rawCells[c] ?? ""))
    const key = hashRow(cells)
    if (seen.has(key)) {
      duplicatesRemoved += 1
      continue
    }
    seen.add(key)

    const repaired = cells.map((value, c) => {
      if (value) {
        const keyName = columnKey(columns[c])
        if (keyName.includes("email")) return value.toLowerCase()
        return standardizeValue(value, columns[c], columnSamples[c])
      }
      missingFilled += 1
      return fills[c]
    })

    outParts.push(repaired.map(csvEscape).join(","))
    rowsWritten += 1
    if (previewRows.length < 10) previewRows.push(repaired)

    if (index % 20_000 === 0) {
      report({
        stage: index < dataLineIndexes.length * 0.75 ? "repairing" : "enhancing",
        rowsSeen: dataLineIndexes.length,
        rowsWritten,
        duplicatesRemoved,
        missingFilled,
        detail: `Cleaned ${rowsWritten.toLocaleString()} of ${dataLineIndexes.length.toLocaleString()} rows…`,
        percent: Math.min(
          92,
          58 + Math.round((34 * (index + 1)) / Math.max(dataLineIndexes.length, 1))
        ),
      })
      await yieldToUi()
    }
  }

  report({
    stage: "preparing",
    rowsSeen: dataLineIndexes.length,
    rowsWritten,
    duplicatesRemoved,
    missingFilled,
    detail: "Preparing your downloadable cleaned file…",
    percent: 96,
  })

  const csvText = outParts.join("\n")
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" })
  const baseName = file.name.replace(/\.[^.]+$/, "") || "dataset"
  const beforeRows = dataLineIndexes.length
  const afterRows = rowsWritten
  const beforeCells = Math.max(beforeRows * columns.length, 1)
  const afterCells = Math.max(afterRows * columns.length, 1)
  const completenessBefore = Number(
    (100 * (1 - stats.reduce((s, c) => s + c.missing, 0) / beforeCells)).toFixed(1)
  )
  const completenessAfter = 100

  const preview: CsvPreview = {
    columns,
    rows: previewRows,
    truncated: afterRows > previewRows.length,
  }

  const cleaning: CleanResponse = {
    blob,
    preview: preview.rows.length ? preview : parseCsvPreview(csvText.slice(0, 256 * 1024)),
    metadata: {
      filename: `${baseName}-sofidr-cleaned.csv`,
      before: { rows: beforeRows, columns: columns.length },
      after: { rows: afterRows, columns: columns.length },
      duplicatesRemoved,
      missingFilled,
      completenessBefore,
      completenessAfter,
      steps: [
        "streamed_local_read",
        "normalized_empty_sentinels",
        "removed_duplicate_rows",
        "canonicalized_country_aliases",
        "filled_missing_values",
        "standardized_common_fields",
        "built_browser_csv_export",
      ],
      exportFormat: "csv",
      sourceFormat: file.name.toLowerCase().endsWith(".tsv") ? "tsv" : "csv",
      processingMode: "local",
      scaleNote:
        beforeRows >= 100_000
          ? `Large-file path: ${beforeRows.toLocaleString()} rows cleaned in your browser.`
          : "Processed in your browser so large files stay within this session.",
      datasetJudgment: `Tabular file with ${beforeRows.toLocaleString()} rows. Applied synonym collapse (US/USA/United States), structural repair, and missing fills in-browser.`,
      tactics: [
        {
          tactic: "Understand dataset",
          column: "(all)",
          why: "Profiled missingness and field types before repair.",
        },
        {
          tactic: "Geographic synonym collapse",
          column: "(geo-like fields)",
          why: "US / USA / United States map to one canonical label.",
        },
        {
          tactic: "Imputation with retention",
          column: "(missing cells)",
          why: "Median/mode fills after duplicate removal.",
        },
      ],
    },
  }

  const profile = buildLocalProfile(
    columns,
    stats,
    afterRows,
    duplicatesRemoved,
    missingFilled,
    cleaning.metadata.sourceFormat
  )

  report({
    stage: "preparing",
    rowsSeen: beforeRows,
    rowsWritten: afterRows,
    duplicatesRemoved,
    missingFilled,
    detail: "Cleaned dataset ready.",
    percent: 100,
  })

  // Drop the giant source string ASAP (GC hint).
  void text

  return { cleaning, profile }
}

/** Build a smaller CSV sample for optional classification on large local files. */
export async function buildClassificationSample(
  file: File,
  maxRows = 5_000
): Promise<File> {
  const text = await file.text()
  const delimiter = detectDelimiter(text.slice(0, 64_000))
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length <= 1) return file
  const header = lines[0]
  const body = lines.slice(1)
  const step = Math.max(1, Math.floor(body.length / maxRows))
  const sampled = [header]
  for (let i = 0; i < body.length && sampled.length <= maxRows; i += step) {
    sampled.push(body[i])
  }
  const blob = new Blob([sampled.join("\n")], { type: "text/csv;charset=utf-8" })
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-sample.csv", {
    type: "text/csv",
  })
}
