import React, { useMemo, useState } from "react"
import {
  CategoryData,
  GeoData,
  KnnData,
  ScatterData,
  TimeSeriesData,
  fmt,
} from "../lib/visualAnalytics"

const ACID = "#c9f76f"
const BLUE = "#8cbeff"
const PALETTE = [ACID, BLUE, "#ffba5c", "#ff7864", "#c99bff", "#6fe0d2", "#f2e66f", "#9aa39a"]

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  display?: string
}) {
  return (
    <label className="chart-slider">
      <span>
        {label} <strong>{display ?? value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function extent(xs: number[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const x of xs) {
    if (x < lo) lo = x
    if (x > hi) hi = x
  }
  if (lo === hi) return [lo - 1, hi + 1]
  return [lo, hi]
}

/* ---------------------------------------------------------------- Histogram */
export function Histogram({ samples }: { samples: Record<string, number[]> }) {
  const options = Object.keys(samples).filter((c) => samples[c].length >= 10)
  const [column, setColumn] = useState(options[0] ?? "")
  const [bins, setBins] = useState(16)
  const xs = samples[column] ?? []

  const { counts, lo, hi, mean, median } = useMemo(() => {
    const [l, h] = extent(xs)
    const c = Array(bins).fill(0)
    for (const x of xs) c[Math.min(bins - 1, Math.floor(((x - l) / (h - l)) * bins))] += 1
    const s = [...xs].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return {
      counts: c as number[],
      lo: l,
      hi: h,
      mean: xs.reduce((a, b) => a + b, 0) / (xs.length || 1),
      median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    }
  }, [xs, bins])

  if (!options.length) return null
  const W = 560
  const H = 200
  const maxC = Math.max(...counts, 1)
  const bw = W / bins
  const xPos = (v: number) => ((v - lo) / (hi - lo)) * W

  return (
    <div className="chart-block">
      <div className="chart-controls">
        <label className="chart-select">
          <span>Measure</span>
          <select value={column} onChange={(e) => setColumn(e.target.value)}>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <Slider label="Bins" value={bins} min={5} max={40} onChange={setBins} />
      </div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="chart-svg" role="img" aria-label={`Histogram of ${column}`}>
        {counts.map((c, i) => (
          <rect
            key={i}
            x={i * bw + 1}
            y={H - (c / maxC) * H}
            width={Math.max(1, bw - 2)}
            height={(c / maxC) * H}
            fill={ACID}
            opacity={0.75}
          >
            <title>{`${fmt(lo + (i * (hi - lo)) / bins)} – ${fmt(lo + ((i + 1) * (hi - lo)) / bins)}: ${c}`}</title>
          </rect>
        ))}
        <line x1={xPos(mean)} x2={xPos(mean)} y1={0} y2={H} stroke="#ff7864" strokeDasharray="4 3" />
        <line x1={xPos(median)} x2={xPos(median)} y1={0} y2={H} stroke={BLUE} strokeDasharray="4 3" />
        <text x={0} y={H + 16} className="chart-axis">{fmt(lo)}</text>
        <text x={W} y={H + 16} textAnchor="end" className="chart-axis">{fmt(hi)}</text>
      </svg>
      <p className="journey-caption">
        <span style={{ color: "#ff7864" }}>Mean {fmt(mean)}</span> ·{" "}
        <span style={{ color: BLUE }}>Median {fmt(median)}</span> · {xs.length.toLocaleString()} values
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ Scatter */
export function ScatterPlot({ data }: { data: ScatterData }) {
  const W = 560
  const H = 260
  const [x0, x1] = extent(data.points.map((p) => p[0]))
  const [y0, y1] = extent(data.points.map((p) => p[1]))
  const sx = (v: number) => 30 + ((v - x0) / (x1 - x0)) * (W - 40)
  const sy = (v: number) => H - 20 - ((v - y0) / (y1 - y0)) * (H - 30)

  // least-squares trend line
  const n = data.points.length
  const mx = data.points.reduce((a, p) => a + p[0], 0) / n
  const my = data.points.reduce((a, p) => a + p[1], 0) / n
  const sxy = data.points.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0)
  const sxx = data.points.reduce((a, p) => a + (p[0] - mx) ** 2, 0) || 1
  const slope = sxy / sxx
  const icpt = my - slope * mx

  return (
    <div className="chart-block">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`${data.x} vs ${data.y}`}>
        <line x1={30} y1={H - 20} x2={W - 10} y2={H - 20} className="chart-gridline" />
        <line x1={30} y1={10} x2={30} y2={H - 20} className="chart-gridline" />
        {data.points.map((p, i) => (
          <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={2.6} fill={BLUE} opacity={0.55} />
        ))}
        <line
          x1={sx(x0)}
          y1={sy(slope * x0 + icpt)}
          x2={sx(x1)}
          y2={sy(slope * x1 + icpt)}
          stroke={ACID}
          strokeWidth={2}
        />
        <text x={W - 10} y={H - 4} textAnchor="end" className="chart-axis">{data.x} →</text>
        <text x={34} y={14} className="chart-axis">↑ {data.y}</text>
      </svg>
      <p className="journey-caption">
        r = {data.r.toFixed(2)} · {data.points.length} points · green line = linear trend
      </p>
    </div>
  )
}

/* -------------------------------------------------------------- KNN explorer */
export function KnnExplorer({ data }: { data: KnnData }) {
  const [k, setK] = useState(5)
  const mostIsolated = useMemo(
    () => data.isolation.indexOf(Math.max(...data.isolation)),
    [data.isolation]
  )
  const [focus, setFocus] = useState(mostIsolated)

  const neighbours = useMemo(() => {
    const v = data.vectors[focus]
    return data.vectors
      .map((w, j) => ({ j, d: j === focus ? Infinity : Math.hypot(...v.map((x, i) => x - w[i])) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
  }, [data.vectors, focus, k])

  const W = 560
  const H = 240
  const [x0, x1] = extent(data.vectors.map((v) => v[0]))
  const [y0, y1] = extent(data.vectors.map((v) => v[1]))
  const sx = (v: number) => 20 + ((v - x0) / (x1 - x0)) * (W - 30)
  const sy = (v: number) => H - 20 - ((v - y0) / (y1 - y0)) * (H - 30)
  const nset = new Set(neighbours.map((n) => n.j))
  const isoMed = [...data.isolation].sort((a, b) => a - b)[Math.floor(data.isolation.length / 2)]
  const fv = data.vectors[focus]

  return (
    <div className="chart-block">
      <div className="chart-controls">
        <Slider label="k (neighbours)" value={k} min={1} max={15} onChange={setK} />
        <Slider
          label="Record"
          value={focus}
          min={0}
          max={data.vectors.length - 1}
          onChange={setFocus}
          display={`#${focus + 1}`}
        />
        <button type="button" className="chart-chip" onClick={() => setFocus(mostIsolated)}>
          Jump to most unusual
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="K nearest neighbours">
        {neighbours.map((n) => (
          <line
            key={`l${n.j}`}
            x1={sx(fv[0])}
            y1={sy(fv[1])}
            x2={sx(data.vectors[n.j][0])}
            y2={sy(data.vectors[n.j][1])}
            stroke={ACID}
            strokeOpacity={0.5}
          />
        ))}
        {data.vectors.map((v, i) => (
          <circle
            key={i}
            cx={sx(v[0])}
            cy={sy(v[1])}
            r={i === focus ? 6 : nset.has(i) ? 4 : 2.4}
            fill={i === focus ? "#ff7864" : nset.has(i) ? ACID : "rgba(140,190,255,0.45)"}
            onClick={() => setFocus(i)}
            style={{ cursor: "pointer" }}
          />
        ))}
        <text x={W - 10} y={H - 4} textAnchor="end" className="chart-axis">{data.columns[0]} (z) →</text>
        <text x={24} y={14} className="chart-axis">↑ {data.columns[1]} (z)</text>
      </svg>
      <p className="journey-caption">
        Distance uses all {data.columns.length} measures ({data.columns.join(", ")}); plot shows the
        first two. Record #{focus + 1} isolation: {data.isolation[focus].toFixed(2)} (typical{" "}
        {isoMed.toFixed(2)}).
      </p>
      <div className="table-container knn-table">
        <table>
          <thead>
            <tr>
              <th>Record</th>
              {data.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="is-focus">
              <td>#{focus + 1}</td>
              {data.raw[focus].map((v, i) => (
                <td key={i}>{fmt(v)}</td>
              ))}
              <td>—</td>
            </tr>
            {neighbours.map((n) => (
              <tr key={n.j}>
                <td>#{n.j + 1}</td>
                {data.raw[n.j].map((v, i) => (
                  <td key={i}>{fmt(v)}</td>
                ))}
                <td>{n.d.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- Time series */
export function TimeSeriesChart({ data }: { data: TimeSeriesData }) {
  const n = data.points.length
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(n - 1)
  const [metric, setMetric] = useState<"value" | "count">(data.valueColumn ? "value" : "count")
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const pts = data.points.slice(lo, hi + 1)
  const ys = pts.map((p) => (metric === "value" ? p.value : p.count))
  const W = 560
  const H = 220
  const maxY = Math.max(...ys, 1)
  const sx = (i: number) => 30 + (pts.length <= 1 ? 0 : (i / (pts.length - 1)) * (W - 40))
  const sy = (v: number) => H - 22 - (v / maxY) * (H - 34)
  const path = ys.map((v, i) => `${i ? "L" : "M"}${sx(i)},${sy(v)}`).join(" ")
  const area = `${path} L${sx(ys.length - 1)},${H - 22} L${sx(0)},${H - 22} Z`

  return (
    <div className="chart-block">
      <div className="chart-controls">
        <Slider label="From" value={from} min={0} max={n - 1} onChange={setFrom} display={data.points[from].label} />
        <Slider label="To" value={to} min={0} max={n - 1} onChange={setTo} display={data.points[to].label} />
        {data.valueColumn && (
          <div className="chart-toggle" role="group" aria-label="Measure">
            <button type="button" className={metric === "value" ? "is-on" : ""} onClick={() => setMetric("value")}>
              {data.valueColumn}
            </button>
            <button type="button" className={metric === "count" ? "is-on" : ""} onClick={() => setMetric("count")}>
              Records
            </button>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Time series">
        <line x1={30} y1={H - 22} x2={W - 10} y2={H - 22} className="chart-gridline" />
        <path d={area} fill="rgba(201,247,111,0.12)" />
        <path d={path} fill="none" stroke={ACID} strokeWidth={2} />
        {ys.map((v, i) => (
          <circle key={i} cx={sx(i)} cy={sy(v)} r={pts.length > 60 ? 1.5 : 3} fill={ACID}>
            <title>{`${pts[i].label}: ${fmt(v)}`}</title>
          </circle>
        ))}
        <text x={30} y={H - 6} className="chart-axis">{pts[0]?.label}</text>
        <text x={W - 10} y={H - 6} textAnchor="end" className="chart-axis">{pts[pts.length - 1]?.label}</text>
        <text x={30} y={12} className="chart-axis">max {fmt(maxY)}</text>
      </svg>
      <p className="journey-caption">
        Grouped by {data.unit} on {data.column} · {pts.length} periods shown
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ Pie chart */
export function PieChart({ data }: { data: CategoryData }) {
  const R = 90
  const C = 110
  const slices = data.top.slice(0, 6)
  const rest = data.total - slices.reduce((a, s) => a + s.count, 0)
  const all = rest > 0 ? [...slices, { value: "Other", count: rest, pct: Number(((100 * rest) / data.total).toFixed(1)) }] : slices
  let angle = -Math.PI / 2
  return (
    <div className="chart-block pie-block">
      <svg viewBox="0 0 220 220" className="chart-svg pie-svg" role="img" aria-label={`Share by ${data.column}`}>
        {all.map((s, i) => {
          const sweep = (s.count / data.total) * Math.PI * 2
          const a0 = angle
          const a1 = angle + sweep
          angle = a1
          if (sweep >= Math.PI * 2 - 1e-6) return <circle key={s.value} cx={C} cy={C} r={R} fill={PALETTE[i]} />
          const large = sweep > Math.PI ? 1 : 0
          const d = `M${C},${C} L${C + R * Math.cos(a0)},${C + R * Math.sin(a0)} A${R},${R} 0 ${large} 1 ${C + R * Math.cos(a1)},${C + R * Math.sin(a1)} Z`
          return (
            <path key={s.value} d={d} fill={PALETTE[i]} stroke="#0b0d0b" strokeWidth={1.5}>
              <title>{`${s.value}: ${s.pct}%`}</title>
            </path>
          )
        })}
        <circle cx={C} cy={C} r={42} fill="#101411" />
        <text x={C} y={C - 2} textAnchor="middle" className="pie-center">{all[0].pct}%</text>
        <text x={C} y={C + 14} textAnchor="middle" className="chart-axis">{all[0].value}</text>
      </svg>
      <ul className="pie-legend">
        {all.map((s, i) => (
          <li key={s.value}>
            <i style={{ background: PALETTE[i] }} />
            <span>{s.value}</span>
            <strong>{s.pct}%</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------- Bar chart */
export function CategoryBars({ data }: { data: CategoryData }) {
  const [show, setShow] = useState(Math.min(8, data.top.length))
  const items = data.top.slice(0, show)
  const max = Math.max(...items.map((t) => t.count), 1)
  return (
    <div className="chart-block">
      {data.top.length > 3 && (
        <div className="chart-controls">
          <Slider label="Show top" value={show} min={3} max={data.top.length} onChange={setShow} />
        </div>
      )}
      <ul className="viz-bars">
        {items.map((t, i) => (
          <li key={t.value} className={i < 3 ? "is-highlight" : undefined}>
            <div className="viz-bar-meta">
              <span>{t.value}</span>
              <strong>
                {t.count.toLocaleString()} · {t.pct}%
              </strong>
            </div>
            <div className="viz-bar-track">
              <span style={{ width: `${Math.max(2, (100 * t.count) / max)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="journey-caption">
        {data.distinct} distinct values in {data.column}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ Geographic map */
export function GeoMap({ data }: { data: GeoData }) {
  const W = 560
  const H = 280
  const sx = (lon: number) => ((lon + 180) / 360) * W
  const sy = (lat: number) => ((90 - lat) / 180) * H
  const maxC = Math.max(...data.points.map((p) => p.count), 1)
  const total = data.points.reduce((a, p) => a + p.count, 0)
  return (
    <div className="chart-block">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg geo-svg" role="img" aria-label="Geographic distribution">
        <rect x={0} y={0} width={W} height={H} fill="#0d110e" rx={10} />
        {[-60, -30, 0, 30, 60].map((lat) => (
          <line key={`lat${lat}`} x1={0} x2={W} y1={sy(lat)} y2={sy(lat)} className="chart-gridline" />
        ))}
        {[-120, -60, 0, 60, 120].map((lon) => (
          <line key={`lon${lon}`} y1={0} y2={H} x1={sx(lon)} x2={sx(lon)} className="chart-gridline" />
        ))}
        {data.points.map((p, i) => {
          const r = data.mode === "latlon" ? 2.5 : 4 + 18 * Math.sqrt(p.count / maxC)
          return (
            <g key={`${p.name}-${i}`}>
              <circle cx={sx(p.lon)} cy={sy(p.lat)} r={r} fill={ACID} fillOpacity={0.35} stroke={ACID} />
              {data.mode === "country" && i < 6 && (
                <text x={sx(p.lon)} y={sy(p.lat) - r - 3} textAnchor="middle" className="chart-axis">
                  {p.name}
                </text>
              )}
              <title>{`${p.name}: ${p.count.toLocaleString()}`}</title>
            </g>
          )
        })}
      </svg>
      {data.mode === "country" && (
        <ul className="geo-legend">
          {data.points.slice(0, 8).map((p) => (
            <li key={p.name}>
              <span>{p.name}</span>
              <strong>
                {p.count.toLocaleString()} · {((100 * p.count) / total).toFixed(1)}%
              </strong>
            </li>
          ))}
        </ul>
      )}
      <p className="journey-caption">
        Bubble size = record count at country centroid · grid = 30° lat/lon
        {data.unmatched ? ` · ${data.unmatched} values not recognized as countries` : ""}
      </p>
    </div>
  )
}
