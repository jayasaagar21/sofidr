/**
 * Chart selection for the Analytics page: inspects the cleaned frame, decides
 * which visual forms fit (histogram, scatter, heatmap, KNN, time series, bar,
 * pie, geographic) and derives a business reading from each for the Report.
 */

import { COUNTRY_CENTROIDS, countryKey } from "./geoCentroids"

export type VisualKind =
  | "timeseries"
  | "geo"
  | "histogram"
  | "scatter"
  | "heatmap"
  | "knn"
  | "pie"
  | "bar"

export interface VisualChoice {
  kind: VisualKind
  title: string
  why: string
}

export interface VisualInsight {
  kind: VisualKind
  title: string
  metric: string
  detail: string
}

export interface TimeSeriesData {
  column: string
  unit: "day" | "month"
  valueColumn: string | null
  points: { label: string; count: number; value: number }[]
}

export interface GeoData {
  mode: "country" | "latlon"
  column: string
  points: { name: string; lat: number; lon: number; count: number }[]
  unmatched: number
}

export interface ScatterData {
  x: string
  y: string
  r: number
  points: [number, number][]
}

export interface KnnData {
  columns: string[]
  /** z-scored feature vectors (sampled). */
  vectors: number[][]
  /** Raw values for display, aligned with `vectors`. */
  raw: number[][]
  /** Mean distance to the 5 nearest neighbours, per vector. */
  isolation: number[]
}

export interface CategoryData {
  column: string
  distinct: number
  total: number
  top: { value: string; count: number; pct: number }[]
}

export interface VisualAnalytics {
  choices: VisualChoice[]
  numericSamples: Record<string, number[]>
  timeSeries: TimeSeriesData | null
  geo: GeoData | null
  scatter: ScatterData | null
  knn: KnnData | null
  pie: CategoryData | null
  bar: CategoryData | null
  insights: VisualInsight[]
}

const VALUE_HINT = /(amount|revenue|sales|price|spend|total|cost|value|qty|quantity|profit|income)/i
const DATE_HINT = /(date|time|day|month|created|updated|timestamp|period)/i
const GEO_HINT = /(country|nation)/i

function parseDate(raw: string): number | null {
  const v = raw.trim()
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(v)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return Date.UTC(y, mo - 1, d)
    return null
  }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(v)
  if (m) {
    // Day-first, matching the server's date normalization.
    let [d, mo] = [Number(m[1]), Number(m[2])]
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return Date.UTC(Number(m[3]), mo - 1, d)
  }
  return null
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function pearson(a: number[], b: number[]): number {
  let n = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    n += 1
    sx += x
    sy += y
    sxx += x * x
    syy += y * y
    sxy += x * y
  }
  if (n < 3) return 0
  const vx = sxx - (sx * sx) / n
  const vy = syy - (sy * sy) / n
  if (vx <= 0 || vy <= 0) return 0
  return (sxy - (sx * sy) / n) / Math.sqrt(vx * vy)
}

export const fmt = (v: number): string => {
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}k`
  if (a >= 100) return v.toFixed(0)
  if (a >= 1) return v.toFixed(1)
  return v.toFixed(2)
}

function categoryData(column: string, values: string[]): CategoryData | null {
  const counts = new Map<string, number>()
  let total = 0
  for (const raw of values) {
    const v = raw.trim()
    if (!v) continue
    total += 1
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  if (total < 5 || counts.size < 2) return null
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count, pct: Number(((100 * count) / total).toFixed(1)) }))
  return { column, distinct: counts.size, total, top }
}

export function buildVisualAnalytics(input: {
  columns: string[]
  rows: string[][]
  numericColumns: string[]
  numericSeries: number[][]
  topPair: { left: string; right: string; value: number } | null
}): VisualAnalytics {
  const { columns, rows, numericColumns, numericSeries, topPair } = input
  const colIndex = new Map(columns.map((c, i) => [c, i]))
  const values = (c: string) => {
    const i = colIndex.get(c) ?? -1
    return rows.map((r) => r[i] ?? "")
  }

  const numericSamples: Record<string, number[]> = {}
  numericColumns.forEach((c, i) => {
    numericSamples[c] = numericSeries[i].filter((v) => Number.isFinite(v)).slice(0, 4000)
  })

  // ---- time series ------------------------------------------------------
  let timeSeries: TimeSeriesData | null = null
  const dateCandidates = columns
    .filter((c) => !numericColumns.includes(c) && !c.includes("__was_missing"))
    .map((c) => {
      const vs = values(c).filter((v) => v.trim())
      const parsed = vs.slice(0, 300).map(parseDate)
      const ok = parsed.filter((p) => p != null).length
      return { c, rate: vs.length ? ok / Math.min(vs.length, 300) : 0 }
    })
    .filter((d) => d.rate >= 0.8)
    .sort((a, b) => Number(DATE_HINT.test(b.c)) - Number(DATE_HINT.test(a.c)) || b.rate - a.rate)
  if (dateCandidates[0]) {
    const dateCol = dateCandidates[0].c
    const valueCol =
      numericColumns.find((c) => VALUE_HINT.test(c)) ?? null
    const vi = valueCol ? numericColumns.indexOf(valueCol) : -1
    const di = colIndex.get(dateCol) ?? -1
    const stamps: { t: number; v: number }[] = []
    rows.forEach((r, ri) => {
      const t = parseDate(r[di] ?? "")
      if (t == null) return
      stamps.push({ t, v: vi >= 0 ? numericSeries[vi][ri] : NaN })
    })
    if (stamps.length >= 5) {
      const min = Math.min(...stamps.map((s) => s.t))
      const max = Math.max(...stamps.map((s) => s.t))
      const unit: "day" | "month" = max - min > 90 * 86400000 ? "month" : "day"
      const buckets = new Map<string, { count: number; value: number }>()
      for (const s of stamps) {
        const d = new Date(s.t)
        const key =
          unit === "month"
            ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
            : d.toISOString().slice(0, 10)
        const b = buckets.get(key) ?? { count: 0, value: 0 }
        b.count += 1
        if (Number.isFinite(s.v)) b.value += s.v
        buckets.set(key, b)
      }
      const points = [...buckets.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, b]) => ({ label, count: b.count, value: b.value }))
      if (points.length >= 3) timeSeries = { column: dateCol, unit, valueColumn: valueCol, points }
    }
  }

  // ---- geographic -------------------------------------------------------
  let geo: GeoData | null = null
  const latCol = columns.find((c) => /^(lat|latitude)$/i.test(c.trim()))
  const lonCol = columns.find((c) => /^(lon|lng|long|longitude)$/i.test(c.trim()))
  if (latCol && lonCol && numericColumns.includes(latCol) && numericColumns.includes(lonCol)) {
    const la = numericSeries[numericColumns.indexOf(latCol)]
    const lo = numericSeries[numericColumns.indexOf(lonCol)]
    const pts: GeoData["points"] = []
    for (let i = 0; i < la.length && pts.length < 1500; i += 1) {
      if (Math.abs(la[i]) <= 90 && Math.abs(lo[i]) <= 180)
        pts.push({ name: `${la[i].toFixed(2)}, ${lo[i].toFixed(2)}`, lat: la[i], lon: lo[i], count: 1 })
    }
    if (pts.length >= 5) geo = { mode: "latlon", column: `${latCol} / ${lonCol}`, points: pts, unmatched: 0 }
  }
  if (!geo) {
    for (const c of columns) {
      if (numericColumns.includes(c)) continue
      const vs = values(c).filter((v) => v.trim())
      if (vs.length < 5) continue
      const sample = vs.slice(0, 300)
      const matched = sample.filter((v) => countryKey(v)).length / sample.length
      if (matched < 0.6 && !(GEO_HINT.test(c) && matched >= 0.3)) continue
      const counts = new Map<string, number>()
      let unmatched = 0
      for (const v of vs) {
        const k = countryKey(v)
        if (!k) {
          unmatched += 1
          continue
        }
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      if (counts.size < 2) continue
      geo = {
        mode: "country",
        column: c,
        unmatched,
        points: [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, count]) => ({
            name: k.replace(/\b\w/g, (ch) => ch.toUpperCase()),
            lat: COUNTRY_CENTROIDS[k][0],
            lon: COUNTRY_CENTROIDS[k][1],
            count,
          })),
      }
      break
    }
  }

  // ---- scatter (strongest linked pair) ---------------------------------
  let scatter: ScatterData | null = null
  if (topPair && Math.abs(topPair.value) >= 0.3) {
    const xs = numericSeries[numericColumns.indexOf(topPair.left)]
    const ys = numericSeries[numericColumns.indexOf(topPair.right)]
    const pts: [number, number][] = []
    const step = Math.max(1, Math.floor(xs.length / 600))
    for (let i = 0; i < xs.length; i += step) {
      if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) pts.push([xs[i], ys[i]])
    }
    if (pts.length >= 10)
      scatter = { x: topPair.left, y: topPair.right, r: pearson(xs, ys), points: pts }
  }

  // ---- KNN feature space -----------------------------------------------
  let knn: KnnData | null = null
  const knnCols = numericColumns
    .filter((c) => !/(^|_)(id|index|lat|latitude|lon|lng|longitude)$/i.test(c))
    .slice(0, 6)
  if (knnCols.length >= 2) {
    const series = knnCols.map((c) => numericSeries[numericColumns.indexOf(c)])
    const stats = series.map((s) => {
      const f = s.filter((v) => Number.isFinite(v))
      const mean = f.reduce((a, b) => a + b, 0) / (f.length || 1)
      const sd = Math.sqrt(f.reduce((a, b) => a + (b - mean) ** 2, 0) / (f.length || 1)) || 1
      return { mean, sd }
    })
    const vectors: number[][] = []
    const raw: number[][] = []
    const step = Math.max(1, Math.floor(rows.length / 400))
    for (let i = 0; i < rows.length && vectors.length < 400; i += step) {
      const r = series.map((s) => s[i])
      if (r.some((v) => !Number.isFinite(v))) continue
      raw.push(r)
      vectors.push(r.map((v, j) => (v - stats[j].mean) / stats[j].sd))
    }
    if (vectors.length >= 20) {
      const isolation = vectors.map((v, i) => {
        const d = vectors
          .map((w, j) => (i === j ? Infinity : Math.hypot(...v.map((x, k) => x - w[k]))))
          .sort((a, b) => a - b)
          .slice(0, 5)
        return d.reduce((a, b) => a + b, 0) / d.length
      })
      knn = { columns: knnCols, vectors, raw, isolation }
    }
  }

  // ---- categorical: pie for share-of-whole, bar for ranked comparison ---
  const geoCol = geo?.mode === "country" ? geo.column : null
  const cats = columns
    .filter((c) => !numericColumns.includes(c) && c !== geoCol && c !== timeSeries?.column)
    .filter((c) => !c.includes("__was_missing"))
    .map((c) => categoryData(c, values(c)))
    .filter((d): d is CategoryData => !!d && d.distinct <= Math.max(30, d.total * 0.5))
  const pie = cats.filter((d) => d.distinct <= 6).sort((a, b) => a.distinct - b.distinct)[0] ?? null
  const bar =
    cats
      .filter((d) => d !== pie && d.distinct > 2)
      .sort((a, b) => b.distinct - a.distinct)[0] ??
    cats.find((d) => d !== pie) ??
    null

  // ---- choose the relevant visuals --------------------------------------
  const choices: VisualChoice[] = []
  if (timeSeries) {
    const ts = timeSeries as TimeSeriesData
    choices.push({
      kind: "timeseries",
      title: `Trend over ${ts.column}`,
      why: `${ts.column} parses as dates across ${ts.points.length} ${ts.unit}s — a time series shows trend, seasonality and spikes that totals hide.`,
    })
  }
  if (geo) {
    const g = geo as GeoData
    choices.push({
      kind: "geo",
      title: g.mode === "country" ? `Where records sit (${g.column})` : "Location map",
      why:
        g.mode === "country"
          ? `${g.column} holds country names (${g.points.length} matched) — a map shows geographic concentration at a glance.`
          : `Latitude/longitude columns detected — plotting them reveals spatial clusters.`,
    })
  }
  const histCol = Object.entries(numericSamples)
    .filter(([c, v]) => v.length >= 10 && !/(^|_)(id|lat|latitude|lon|lng|longitude)$/i.test(c))
    .sort((a, b) => Number(VALUE_HINT.test(b[0])) - Number(VALUE_HINT.test(a[0])))[0]
  if (histCol) {
    choices.push({
      kind: "histogram",
      title: "Distribution of a key measure",
      why: `Numeric measures like ${histCol[0]} need a histogram to see skew, spread and clusters before trusting an average.`,
    })
  }
  if (scatter) {
    const s = scatter as ScatterData
    choices.push({
      kind: "scatter",
      title: `${s.x} vs ${s.y}`,
      why: `This is the strongest numeric relationship (r=${s.r.toFixed(2)}); a scatterplot shows whether it is linear, clustered or driven by a few points.`,
    })
  }
  if (numericColumns.length >= 3) {
    choices.push({
      kind: "heatmap",
      title: "Correlation heatmap",
      why: `${numericColumns.length} numeric fields — a heatmap compares every pair at once to spot redundant or linked measures.`,
    })
  }
  if (knn) {
    choices.push({
      kind: "knn",
      title: "K-nearest-neighbour explorer",
      why: `Records can be compared on ${knn.columns.length} measures together; KNN finds look-alike records and flags isolated ones that single-column checks miss.`,
    })
  }
  if (pie) {
    choices.push({
      kind: "pie",
      title: `Share by ${pie.column}`,
      why: `${pie.column} has only ${pie.distinct} values that add up to a whole — a pie chart is the clearest share-of-total view.`,
    })
  }
  if (bar) {
    choices.push({
      kind: "bar",
      title: `Top ${bar.column} values`,
      why: `${bar.column} has ${bar.distinct} categories — a ranked bar chart compares them where a pie would be unreadable.`,
    })
  }

  const visual: VisualAnalytics = {
    choices,
    numericSamples,
    timeSeries,
    geo,
    scatter,
    knn,
    pie,
    bar,
    insights: [],
  }
  visual.insights = deriveVisualInsights(visual, histCol?.[0] ?? null)
  return visual
}

function deriveVisualInsights(v: VisualAnalytics, histCol: string | null): VisualInsight[] {
  const out: VisualInsight[] = []

  if (v.timeSeries) {
    const pts = v.timeSeries.points
    const useValue = v.timeSeries.valueColumn && pts.some((p) => p.value !== 0)
    const series = pts.map((p) => (useValue ? p.value : p.count))
    const k = Math.max(1, Math.floor(series.length / 3))
    const first = series.slice(0, k).reduce((a, b) => a + b, 0) / k
    const last = series.slice(-k).reduce((a, b) => a + b, 0) / k
    const change = first ? ((last - first) / first) * 100 : 0
    const peak = pts[series.indexOf(Math.max(...series))]
    const measure = useValue ? `${v.timeSeries.valueColumn}` : "record volume"
    out.push({
      kind: "timeseries",
      title: change >= 0 ? `${measure} is growing` : `${measure} is declining`,
      metric: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
      detail: `Comparing the first and last third of the period, ${measure} moved ${change.toFixed(0)}%. Peak ${v.timeSeries.unit}: ${peak.label}. Plan capacity and targets around the trend, not the overall average.`,
    })
  }

  if (v.geo) {
    const total = v.geo.points.reduce((a, p) => a + p.count, 0)
    const top = v.geo.points[0]
    if (v.geo.mode === "country" && top) {
      const share = (100 * top.count) / total
      out.push({
        kind: "geo",
        title: `${top.name} is the core market`,
        metric: `${share.toFixed(0)}%`,
        detail: `${top.name} holds ${share.toFixed(0)}% of records across ${v.geo.points.length} countries.${
          share >= 50 ? " Concentration risk: results mostly reflect one market." : " Footprint is diversified; compare markets before generalizing."
        }`,
      })
    } else {
      out.push({
        kind: "geo",
        title: "Spatial footprint mapped",
        metric: String(v.geo.points.length),
        detail: "Location points plotted; check dense clusters for service coverage or sales territory decisions.",
      })
    }
  }

  if (histCol) {
    const xs = v.numericSamples[histCol]
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const med = median(xs)
    const gap = med ? ((mean - med) / Math.abs(med)) * 100 : 0
    out.push({
      kind: "histogram",
      title: Math.abs(gap) >= 10 ? `Average ${histCol} is misleading` : `${histCol} is evenly centred`,
      metric: `median ${fmt(med)}`,
      detail:
        Math.abs(gap) >= 10
          ? `Mean (${fmt(mean)}) sits ${Math.abs(gap).toFixed(0)}% ${gap > 0 ? "above" : "below"} the median — a few ${gap > 0 ? "large" : "small"} values pull it. Report the median as the typical case.`
          : `Mean (${fmt(mean)}) and median are close, so the average is a fair summary for targets.`,
    })
  }

  if (v.scatter) {
    const r = v.scatter.r
    out.push({
      kind: "scatter",
      title: `${v.scatter.x} and ${v.scatter.y} move ${r > 0 ? "together" : "in opposite directions"}`,
      metric: `r ${r.toFixed(2)}`,
      detail: `${Math.abs(r) >= 0.7 ? "Strong" : "Moderate"} ${r > 0 ? "positive" : "negative"} link. Use one as a leading indicator for the other, but confirm causation before acting on it.`,
    })
  }

  if (v.knn) {
    const iso = v.knn.isolation
    const sorted = [...iso].sort((a, b) => a - b)
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    const threshold = median(iso) * 2.5
    const isolated = iso.filter((d) => d > threshold).length
    out.push({
      kind: "knn",
      title: isolated ? "Unusual records found by KNN" : "Records form consistent groups",
      metric: `${isolated} of ${iso.length}`,
      detail: isolated
        ? `${isolated} sampled records sit far from their 5 nearest neighbours (beyond 2.5× typical distance). Review them for fraud, data entry errors, or a niche segment worth its own strategy.`
        : `Every sampled record has close look-alikes (90th-percentile neighbour distance ${p90.toFixed(2)}). Segment-level strategies will transfer well across records.`,
    })
  }

  if (v.pie) {
    const t = v.pie.top[0]
    out.push({
      kind: "pie",
      title: `${t.value} dominates ${v.pie.column}`,
      metric: `${t.pct}%`,
      detail: `${t.value} accounts for ${t.pct}% of ${v.pie.column}${
        v.pie.top[1] ? `, followed by ${v.pie.top[1].value} at ${v.pie.top[1].pct}%` : ""
      }. ${t.pct >= 60 ? "The minority groups are where growth or risk is easiest to miss." : "The mix is balanced enough to compare groups head-to-head."}`,
    })
  }

  if (v.bar) {
    const top3 = v.bar.top.slice(0, 3)
    const share = top3.reduce((a, t) => a + t.pct, 0)
    out.push({
      kind: "bar",
      title: `Top 3 ${v.bar.column} drive ${share.toFixed(0)}%`,
      metric: `${share.toFixed(0)}%`,
      detail: `${top3.map((t) => t.value).join(", ")} lead across ${v.bar.distinct} categories. ${
        share >= 60 ? "Focus resources on these; the long tail adds little volume." : "Volume is spread wide — a long tail strategy matters."
      }`,
    })
  }

  return out
}
