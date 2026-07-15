/**
 * API client for SOFIDR backend.
 * Single source of truth for all backend calls.
 */

export interface FormationResult {
  name: string
  sei: number
  accuracy: number
  stability: number
  retention: number
  simplicity: number
  error?: string
}

export interface OptimizeResponse {
  success: boolean
  dataset_name: string
  terrain_tags: string[]
  cold_start_default: string
  best_by_sei: string
  selected: string
  selection_reason: string
  scoreboard: FormationResult[]
  report: string
  error?: string
}

export interface Archetype {
  [key: string]: string
}

export interface Formation {
  [key: string]: {
    icon: string
    target_terrain: string
    paper: boolean
  }
}

export interface CsvPreview {
  columns: string[]
  rows: string[][]
  truncated: boolean
}

export interface DatasetDimensions {
  rows: number | null
  columns: number | null
}

export interface EnhancementMetadata {
  filename: string
  before: DatasetDimensions
  after: DatasetDimensions
  formation: string
  formationSteps: string[]
  syntheticCount: number
  contentType: string
}

export interface EnhanceResponse {
  blob: Blob
  metadata: EnhancementMetadata
  preview: CsvPreview
}

const API_BASE = "/api"

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String(data.detail)
        : `${res.status} ${res.statusText}`
    throw new Error(detail)
  }
  return data as T
}

function headerValue(headers: Headers, ...names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name)
    if (value !== null) return value
  }
  return null
}

function headerNumber(headers: Headers, ...names: string[]): number | null {
  const value = headerValue(headers, ...names)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function responseFilename(headers: Headers): string {
  const explicit = headerValue(headers, "X-SOFIDR-Filename", "X-Enhanced-Filename")
  if (explicit) return explicit

  const disposition = headers.get("Content-Disposition") || ""
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      return utf8[1]
    }
  }
  const quoted = disposition.match(/filename="?([^";]+)"?/i)
  return quoted?.[1] || "sofidr-enhanced.csv"
}

function parseSteps(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // Some deployments expose a pipe- or comma-delimited header instead.
  }
  return value.split(/\s*(?:\||;|,)\s*/).filter(Boolean)
}

export function parseCsvPreview(csv: string, maxRows = 6): CsvPreview {
  const parsed: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let index = 0

  while (index < csv.length && parsed.length <= maxRows) {
    const char = csv[index]
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"'
        index += 2
        continue
      }
      if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      row.push(field)
      parsed.push(row)
      row = []
      field = ""
      if (char === "\r" && csv[index + 1] === "\n") index += 1
    } else {
      field += char
    }
    index += 1
  }

  if ((field || row.length) && parsed.length <= maxRows) {
    row.push(field)
    parsed.push(row)
  }

  const columns = parsed.shift() || []
  return {
    columns,
    rows: parsed.slice(0, maxRows),
    truncated: parsed.length > maxRows || index < csv.length,
  }
}

export const api = {
  async health() {
    const res = await fetch(`${API_BASE}/health`)
    return readJson<{ status: string; version: string }>(res)
  },

  async listArchetypes(): Promise<Archetype> {
    const res = await fetch(`${API_BASE}/archetypes`)
    const data = await readJson<{ descriptions?: Archetype }>(res)
    return data.descriptions || {}
  },

  async listFormations(): Promise<Formation> {
    const res = await fetch(`${API_BASE}/formations`)
    return readJson<Formation>(res)
  },

  async optimize(
    params: {
      archetype?: string
      file?: File
      model?: "rf" | "logreg"
      iterations?: number
      epsilon?: number
      target_column?: string
    } = {}
  ): Promise<OptimizeResponse> {
    const query = new URLSearchParams()
    const form = new FormData()
    if (params.archetype) query.set("archetype", params.archetype)
    if (params.file) {
      form.append("file", params.file)
      if (params.target_column) query.set("target_column", params.target_column)
    }
    if (params.model) query.set("model", params.model)
    if (params.iterations !== undefined) query.set("iterations", params.iterations.toString())
    if (params.epsilon !== undefined) query.set("epsilon", params.epsilon.toString())

    const suffix = query.toString() ? `?${query}` : ""
    const request: RequestInit = { method: "POST" }
    if (params.file) request.body = form
    const res = await fetch(`${API_BASE}/optimize${suffix}`, request)

    return readJson<OptimizeResponse>(res)
  },

  async enhance(file: File, bestFormation: string): Promise<EnhanceResponse> {
    const form = new FormData()
    form.append("file", file, file.name)
    const query = new URLSearchParams({ formation: bestFormation })

    const res = await fetch(`${API_BASE}/enhance?${query}`, {
      method: "POST",
      body: form,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      const detail =
        data && typeof data === "object" && "detail" in data
          ? String(data.detail)
          : `${res.status} ${res.statusText}`
      throw new Error(detail)
    }

    const blob = await res.blob()
    const previewText = await blob.slice(0, 256 * 1024).text()
    const stepsHeader = headerValue(
      res.headers,
      "X-SOFIDR-Steps"
    )
    const metadata: EnhancementMetadata = {
      filename: responseFilename(res.headers),
      before: {
        rows: headerNumber(res.headers, "X-SOFIDR-Input-Rows"),
        columns: headerNumber(res.headers, "X-SOFIDR-Input-Columns"),
      },
      after: {
        rows: headerNumber(res.headers, "X-SOFIDR-Output-Rows"),
        columns: headerNumber(res.headers, "X-SOFIDR-Output-Columns"),
      },
      formation: bestFormation,
      formationSteps: parseSteps(stepsHeader),
      syntheticCount:
        headerNumber(res.headers, "X-SOFIDR-Synthetic-Rows") || 0,
      contentType: res.headers.get("Content-Type") || "text/csv",
    }

    return { blob, metadata, preview: parseCsvPreview(previewText) }
  },
}
