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
    const res = await fetch(`${API_BASE}/optimize${suffix}`, {
      method: "POST",
      body: form,
    })

    return readJson<OptimizeResponse>(res)
  },
}
