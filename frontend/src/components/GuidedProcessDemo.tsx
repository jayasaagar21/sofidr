import React, { useEffect, useRef, useState } from "react"
import { Button } from "./ui/Button"

/**
 * Auto-playing, clickable story of what SOFIDR does behind the scenes —
 * summarized for interest, not research jargon.
 */
const SCENES = [
  {
    id: "arrive",
    chapter: "01",
    title: "A messy file arrives",
    line: "Blanks, repeats, and odd values hide inside an ordinary spreadsheet.",
    backend: "Read CSV · Excel · JSON into a working table for this session only.",
    visual: "file",
    metric: { label: "Raw rows", value: "12,480" },
    signal: "Upload",
  },
  {
    id: "scan",
    chapter: "02",
    title: "We scan for what breaks trust",
    line: "Missing cells, duplicate rows, and shaky fields are ranked by how much they distort decisions.",
    backend: "Profile completeness, uniqueness, and issue severity across every column.",
    visual: "scan",
    metric: { label: "Issues flagged", value: "37" },
    signal: "Diagnose",
  },
  {
    id: "clean",
    chapter: "03",
    title: "The file is repaired",
    line: "Duplicates drop out. Empty cells get sensible fills. Common fields are standardized.",
    backend: "Structural repair → field normalization → missing-value fill with trace markers.",
    visual: "clean",
    metric: { label: "Rows cleaned", value: "12,106" },
    signal: "Dataset",
  },
  {
    id: "see",
    chapter: "04",
    title: "Patterns become visible",
    line: "Simple charts show where risk lived — and what improved — without drowning you in raw rows.",
    backend: "Surface priority issues and quality dimensions for a visual read.",
    visual: "charts",
    metric: { label: "Completeness", value: "98%" },
    signal: "Visualization",
  },
  {
    id: "choose",
    chapter: "05",
    title: "Options are compared fairly",
    line: "When you have a category to predict, several preparation paths are scored side by side.",
    backend: "Same folds · same model · score correctness, stability, retention, simplicity.",
    visual: "score",
    metric: { label: "Top approach", value: "Phalanx" },
    signal: "Decide",
  },
  {
    id: "report",
    chapter: "06",
    title: "A report you can take away",
    line: "Insights and next actions — from the cleaned data and the charts — ready as Word or PDF.",
    backend: "Compose problem → method → insights → actions. No raw table dump.",
    visual: "report",
    metric: { label: "Export", value: "Word · PDF" },
    signal: "Report",
  },
] as const

const SCENE_MS = 4200

interface GuidedProcessDemoProps {
  active: boolean
  onChooseBenchmark: () => void
}

export default function GuidedProcessDemo({
  active,
  onChooseBenchmark,
}: GuidedProcessDemoProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const reduceMotion = useRef(false)

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion.current) setPlaying(false)
  }, [])

  useEffect(() => {
    if (active) {
      setIndex(0)
      setProgress(0)
      setPlaying(!reduceMotion.current)
      headingRef.current?.focus({ preventScroll: true })
    }
  }, [active])

  useEffect(() => {
    if (!playing) return
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const elapsed = now - started
      const pct = Math.min(100, (elapsed / SCENE_MS) * 100)
      setProgress(pct)
      if (elapsed >= SCENE_MS) {
        setIndex((i) => (i + 1) % SCENES.length)
        setProgress(0)
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [playing, index])

  const scene = SCENES[index]
  const goTo = (next: number) => {
    setIndex(next)
    setProgress(0)
  }

  return (
    <section
      className={`story-demo ${active ? "is-active" : ""}`}
      id="demo"
      aria-labelledby="process-title"
    >
      <div className="story-demo-inner">
        <header className="story-demo-intro">
          <p className="eyebrow">Demo · the story in motion</p>
          <h2 id="process-title" ref={headingRef} tabIndex={-1}>
            Watch what happens to a file.
          </h2>
          <p>
            Auto-plays through the journey — click any chapter to jump. This is a summarized
            view of what SOFIDR does once a spreadsheet lands.
          </p>
        </header>

        <div className="story-stage" aria-live="polite">
          <div className={`story-visual story-visual-${scene.visual}`} aria-hidden="true">
            <StoryVisual kind={scene.visual} chapter={scene.chapter} />
            <div className="story-metric">
              <small>{scene.metric.label}</small>
              <strong>{scene.metric.value}</strong>
            </div>
          </div>

          <div className="story-copy">
            <span className="story-signal">{scene.signal}</span>
            <p className="story-chapter">Chapter {scene.chapter}</p>
            <h3>{scene.title}</h3>
            <p className="story-line">{scene.line}</p>
            <p className="story-backend">
              <span>Behind the scenes</span>
              {scene.backend}
            </p>

            <div className="story-controls">
              <button
                type="button"
                className="story-play"
                onClick={() => setPlaying((p) => !p)}
                aria-pressed={playing}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="story-play"
                onClick={() => goTo((index - 1 + SCENES.length) % SCENES.length)}
              >
                Prev
              </button>
              <button
                type="button"
                className="story-play"
                onClick={() => goTo((index + 1) % SCENES.length)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <ol className="story-chapters" aria-label="Demo chapters">
          {SCENES.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={i === index ? "is-current" : i < index ? "is-done" : ""}
                aria-current={i === index ? "step" : undefined}
                onClick={() => {
                  goTo(i)
                  setPlaying(false)
                }}
              >
                <span className="story-chapter-num">{item.chapter}</span>
                <span className="story-chapter-label">{item.signal}</span>
                {i === index && (
                  <span
                    className="story-chapter-progress"
                    style={{ width: `${progress}%` }}
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          ))}
        </ol>

        <div className="story-demo-cta">
          <p>Ready to run this on a real spreadsheet?</p>
          <Button onClick={onChooseBenchmark}>
            Start with your file <span aria-hidden="true">↓</span>
          </Button>
        </div>
      </div>
    </section>
  )
}

function StoryVisual({
  kind,
  chapter,
}: {
  kind: (typeof SCENES)[number]["visual"]
  chapter: string
}) {
  return (
    <div className="story-canvas">
      <span className="story-canvas-mark">{chapter}</span>
      {kind === "file" && (
        <div className="sv-grid">
          {Array.from({ length: 18 }).map((_, i) => (
            <i key={i} className={i % 5 === 0 || i % 7 === 0 ? "is-bad" : ""} />
          ))}
        </div>
      )}
      {kind === "scan" && (
        <div className="sv-scan">
          <div className="sv-scan-beam" />
          <ul>
            <li className="is-hot">Missing · High</li>
            <li>Duplicates · Medium</li>
            <li>Odd dates · Low</li>
          </ul>
        </div>
      )}
      {kind === "clean" && (
        <div className="sv-clean">
          <div className="sv-row is-out">dup</div>
          <div className="sv-row">filled</div>
          <div className="sv-row">normalized</div>
          <div className="sv-row">ready</div>
        </div>
      )}
      {kind === "charts" && (
        <div className="sv-bars">
          <span style={{ height: "42%" }} />
          <span style={{ height: "78%" }} />
          <span style={{ height: "55%" }} />
          <span style={{ height: "90%" }} />
        </div>
      )}
      {kind === "score" && (
        <div className="sv-score">
          <div className="is-win">
            <b>Phalanx</b>
            <em>0.91</em>
          </div>
          <div>
            <b>Skirmisher</b>
            <em>0.84</em>
          </div>
          <div>
            <b>Guerrilla</b>
            <em>0.79</em>
          </div>
        </div>
      )}
      {kind === "report" && (
        <div className="sv-report">
          <i />
          <i />
          <i />
          <strong>Insight report</strong>
        </div>
      )}
    </div>
  )
}
