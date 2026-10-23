/**
 * Client-side analytics: correlations, skew, outliers, neighbors, category mix.
 */

export interface CorrPair {
  left: string
  right: string
  value: number
}

export interface SkewStat {
  column: string
  skew: number
  mean: number
  std: number
}

export interface OutlierStat {
  column: string
  count: number
  pct: number
  method: string
}

export interface CategoryMix {
  column: string
  distinct: number
  top: { value: string; pct: number }[]
}

export interface DatasetAnalytics {
  rowsAnalyzed: number
  columnCount: number
  categorical: CategoryMix[]
  numericColumns: string[]
  correlationMatrix: number[][]
  corrLabels: string[]
  topPairs: CorrPair[]
  skew: SkewStat[]
  outliers: OutlierStat[]
  neighbors: CorrPair[]
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  let count = 0
  for (let i = 0; i < n; i += 1) {
    const x = a[i]
    const y = b[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    count += 1
    sx += x
    sy += y
    sxx += x * x
    syy += y * y
    sxy += x * y
  }
  if (count < 3) return 0
  const cov = sxy - (sx * sy) / count
  const vx = sxx - (sx * sx) / count
  const vy = syy - (sy * sy) / count
  if (vx <= 0 || vy <= 0) return 0
  return cov / Math.sqrt(vx * vy)
}

function skewness(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v))
  const n = xs.length
  if (n < 3) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const m2 = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const m3 = xs.reduce((a, b) => a + (b - mean) ** 3, 0) / n
  if (m2 <= 1e-12) return 0
  return m3 / Math.pow(m2, 1.5)
}

function iqrOutlierCount(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (xs.length < 8) return 0
  const q1 = xs[Math.floor(xs.length * 0.25)]
  const q3 = xs[Math.floor(xs.length * 0.75)]
  const iqr = q3 - q1
  if (iqr <= 0) return 0
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  return xs.filter((v) => v < lo || v > hi).length
}

function parseCsvTable(csv: string, maxRows = 8000): { columns: string[]; rows: string[][] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length)
  if (!lines.length) return { columns: [], rows: [] }
  const split = (line: string) => {
    const out: string[] = []
    let field = ""
    let quoted = false
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i]
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          field += '"'
          i += 1
        } else if (c === '"') quoted = false
        else field += c
      } else if (c === '"') quoted = true
      else if (c === ",") {
        out.push(field)
        field = ""
      } else field += c
    }
    out.push(field)
    return out
  }
  const columns = split(lines[0])
  const rows = lines.slice(1, maxRows + 1).map(split)
  return { columns, rows }
}

export function buildAnalyticsFromCsv(csv: string): DatasetAnalytics {
  const { columns, rows } = parseCsvTable(csv)
  if (!columns.length || !rows.length) {
    return {
      rowsAnalyzed: 0,
      columnCount: columns.length,
      categorical: [],
      numericColumns: [],
      correlationMatrix: [],
      corrLabels: [],
      topPairs: [],
      skew: [],
      outliers: [],
      neighbors: [],
    }
  }

  const numericIdx: number[] = []
  const numericColumns: string[] = []
  for (let c = 0; c < columns.length; c += 1) {
    if (String(columns[c]).includes("__was_missing")) continue
    let nums = 0
    let seen = 0
    for (const row of rows.slice(0, 200)) {
      const raw = (row[c] ?? "").trim()
      if (!raw) continue
      seen += 1
      if (Number.isFinite(Number(raw.replace(/[$€£,\s%]/g, "")))) nums += 1
    }
    if (seen > 0 && nums / seen >= 0.7) {
      numericIdx.push(c)
      numericColumns.push(columns[c])
    }
  }

  const series: number[][] = numericIdx.map((c) =>
    rows.map((row) => {
      const n = Number(String(row[c] ?? "").replace(/[$€£,\s%]/g, ""))
      return Number.isFinite(n) ? n : NaN
    })
  )

  const n = Math.min(numericColumns.length, 10)
  const labels = numericColumns.slice(0, n)
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  const topPairs: CorrPair[] = []

  for (let i = 0; i < n; i += 1) {
    matrix[i][i] = 1
    for (let j = i + 1; j < n; j += 1) {
      const r = pearson(series[i], series[j])
      matrix[i][j] = r
      matrix[j][i] = r
      if (Math.abs(r) >= 0.35) {
        topPairs.push({ left: labels[i], right: labels[j], value: r })
      }
    }
  }
  topPairs.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  const skew: SkewStat[] = series.slice(0, n).map((vals, i) => {
    const finite = vals.filter((v) => Number.isFinite(v))
    const mean = finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : 0
    const variance =
      finite.length > 1
        ? finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length
        : 0
    return {
      column: labels[i],
      skew: Number(skewness(finite).toFixed(3)),
      mean: Number(mean.toFixed(3)),
      std: Number(Math.sqrt(variance).toFixed(3)),
    }
  })

  const outliers: OutlierStat[] = series.slice(0, n).map((vals, i) => {
    const count = iqrOutlierCount(vals)
    const total = vals.filter((v) => Number.isFinite(v)).length || 1
    return {
      column: labels[i],
      count,
      pct: Number(((100 * count) / total).toFixed(1)),
      method: "IQR 1.5×",
    }
  })

  const numericSet = new Set(numericIdx)
  const categorical: CategoryMix[] = []
  for (let c = 0; c < columns.length; c += 1) {
    if (numericSet.has(c) || String(columns[c]).includes("__was_missing")) continue
    const counts = new Map<string, number>()
    let total = 0
    for (const row of rows) {
      const v = (row[c] ?? "").trim()
      if (!v) continue
      total += 1
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    // Skip identifier-like / free-text fields: segments need repeated values.
    if (total < 5 || counts.size < 2 || counts.size > Math.max(30, total * 0.5)) continue
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, n]) => ({ value, pct: Number(((100 * n) / total).toFixed(1)) }))
    categorical.push({ column: columns[c], distinct: counts.size, top })
  }
  categorical.sort((a, b) => (b.top[0]?.pct ?? 0) - (a.top[0]?.pct ?? 0))

  return {
    rowsAnalyzed: rows.length,
    columnCount: columns.filter((c) => !String(c).includes("__was_missing")).length,
    categorical: categorical.slice(0, 6),
    numericColumns: labels,
    correlationMatrix: matrix,
    corrLabels: labels,
    topPairs: topPairs.slice(0, 12),
    skew: skew.sort((a, b) => Math.abs(b.skew) - Math.abs(a.skew)),
    outliers: outliers.filter((o) => o.count > 0).sort((a, b) => b.count - a.count),
    neighbors: topPairs.slice(0, 6),
  }
}
