import React, { useState, useEffect, useRef } from "react"
import {
  api,
  OptimizeResponse,
  Archetype,
  Formation,
  CleanResponse,
  DatasetProfile,
} from "./api"
import ArchetypeSelector from "./components/ArchetypeSelector"
import FileUploader from "./components/FileUploader"
import GuidedProcessDemo from "./components/GuidedProcessDemo"
import ProcessingPage from "./components/ProcessingPage"
import ResultsWorkspace, { WorkspacePage } from "./components/ResultsWorkspace"
import {
  ScanProgress,
  cleanLocally,
  needsLocalProcessing,
} from "./lib/localClean"
import "./App.css"

type AppRoute = "landing" | "processing" | "workspace"

interface AppState {
  loading: boolean
  error: string
  result: OptimizeResponse | null
  archetypes: Archetype
  formations: Formation
  sourceFile: File | null
  cleaning: CleanResponse | null
  profile: DatasetProfile | null
  scanProgress: ScanProgress | null
  scanLog: string[]
  processMode: "server" | "local" | null
  sourceLabel: string
  strategyNote: string
}

/** Head sample of a large upload for SEI scoring; the server samples 300 stratified rows anyway. */
async function sampleForStrategy(file: File, maxBytes = 1_500_000): Promise<File> {
  if (file.size <= maxBytes || !/\.(csv|tsv|txt)$/i.test(file.name)) return file
  const text = await file.slice(0, maxBytes).text()
  const cut = text.lastIndexOf("\n")
  return new File([cut > 0 ? text.slice(0, cut + 1) : text], file.name, { type: file.type || "text/csv" })
}

async function runStrategy(file: File): Promise<{ result: OptimizeResponse | null; note: string }> {
  try {
    const result = await api.optimize({ file: await sampleForStrategy(file), iterations: 3 })
    return { result, note: "" }
  } catch (err) {
    return { result: null, note: err instanceof Error ? err.message : "Strategy evaluation failed" }
  }
}

function pushLog(log: string[], line: string): string[] {
  if (log[log.length - 1] === line) return log
  return [...log, line]
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>("landing")
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>("dataset")
  const [state, setState] = useState<AppState>({
    loading: false,
    error: "",
    result: null,
    archetypes: {},
    formations: {},
    sourceFile: null,
    cleaning: null,
    profile: null,
    scanProgress: null,
    scanLog: [],
    processMode: null,
    sourceLabel: "",
    strategyNote: "",
  })
  const [demoActive, setDemoActive] = useState(false)
  const benchmarkButtonRef = useRef<HTMLButtonElement>(null)
  const processStartedAt = useRef(0)

  useEffect(() => {
    const load = async () => {
      try {
        const [archetypes, formations] = await Promise.all([
          api.listArchetypes(),
          api.listFormations(),
        ])
        setState((s) => ({ ...s, archetypes, formations }))
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setState((s) => ({
          ...s,
          error: `Unable to load SOFIDR options: ${message}`,
        }))
      }
    }
    load()
  }, [])

  const goLanding = () => {
    setRoute("landing")
    setWorkspacePage("dataset")
    setState((s) => ({
      ...s,
      loading: false,
      error: "",
      result: null,
      sourceFile: null,
      cleaning: null,
      profile: null,
      scanProgress: null,
      scanLog: [],
      processMode: null,
      sourceLabel: "",
      strategyNote: "",
    }))
    window.requestAnimationFrame(() => {
      document.getElementById("start")?.scrollIntoView({ block: "start" })
    })
  }

  const finishToWorkspace = async (patch: Partial<AppState>) => {
    const elapsed = Date.now() - processStartedAt.current
    const wait = Math.max(0, 5200 - elapsed)
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait))
    setState((s) => ({
      ...s,
      ...patch,
      loading: false,
      scanProgress: null,
      scanLog: pushLog(
        pushLog(patch.scanLog || s.scanLog, "Scan complete"),
        "Results ready"
      ),
    }))
    setWorkspacePage("dataset")
    setRoute("workspace")
  }

  const handleArchetypeSelect = async (archetype: string) => {
    processStartedAt.current = Date.now()
    setRoute("processing")
    setWorkspacePage("dataset")
    setState((s) => ({
      ...s,
      loading: true,
      error: "",
      sourceFile: null,
      cleaning: null,
      profile: null,
      scanProgress: null,
      scanLog: [
        "Example selected",
        "Understand the dataset",
        "Choose cleaning / comparison tactics",
        "Running fair scoreboard",
      ],
      processMode: "server",
      result: null,
      strategyNote: "",
      sourceLabel: archetype.replace(/_/g, " "),
    }))
    try {
      const result = await api.optimize({ archetype })
      await finishToWorkspace({
        result,
        sourceLabel: result.dataset_name || archetype.replace(/_/g, " "),
        scanLog: [
          "Example selected",
          "Understand the dataset",
          "Compare preparation options",
          "Double-check scores",
          "Results ready",
        ],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false }))
    }
  }

  const handleFileUpload = async (file: File) => {
    const useLocal = needsLocalProcessing(file)
    processStartedAt.current = Date.now()
    setRoute("processing")
    setWorkspacePage("dataset")
    setState((s) => ({
      ...s,
      loading: true,
      error: "",
      sourceFile: file,
      result: null,
      cleaning: null,
      profile: null,
      scanProgress: null,
      scanLog: [
        `File added: ${file.name}`,
        "Reconnaissance: measure data terrain",
        "Choose cleaning tactics",
      ],
      processMode: useLocal ? "local" : "server",
      sourceLabel: file.name,
      strategyNote: "",
    }))
    const strategyLog = (s: { result: OptimizeResponse | null; note: string }) =>
      s.result
        ? [
            `Algorithm 1 default: ${s.result.cold_start_default}`,
            `SEI evaluation: ${s.result.scoreboard.length} formations scored`,
            `Iterative refinement: ${s.result.refinement_log?.length ?? 0} perturbation rounds`,
            `Selected formation: ${s.result.best_by_sei}`,
          ]
        : [`SEI evaluation skipped: ${s.note}`]
    try {
      if (useLocal) {
        const strategyPromise = runStrategy(file)
        const { cleaning, profile } = await cleanLocally(file, {
          onProgress: (scanProgress) =>
            setState((s) => ({
              ...s,
              scanProgress,
              scanLog: pushLog(s.scanLog, scanProgress.detail),
            })),
        })
        const strategy = await strategyPromise
        await finishToWorkspace({
          cleaning,
          profile,
          result: strategy.result,
          strategyNote: strategy.note,
          scanLog: [
            `File added: ${file.name}`,
            "Reconnaissance: measure data terrain",
            "Canonicalize aliases (US / USA / United States)",
            "Structural repair & fills",
            ...strategyLog(strategy),
            "Preview prepared",
          ],
        })
        return
      }

      setState((s) => ({
        ...s,
        scanLog: pushLog(s.scanLog, "Profiling, cleaning & scoring formations"),
      }))
      const [profile, cleaning, strategy] = await Promise.all([
        api.profile(file),
        api.clean(file, "csv"),
        runStrategy(file),
      ])
      cleaning.metadata.processingMode = "server"
      await finishToWorkspace({
        cleaning,
        profile,
        result: strategy.result,
        strategyNote: strategy.note,
        scanLog: [
          `File added: ${file.name}`,
          "Reconnaissance: measure data terrain",
          ...(cleaning.metadata.tactics || []).slice(0, 4).map((t) => t.tactic),
          ...strategyLog(strategy),
          "Preview prepared",
        ],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false, scanProgress: null }))
    }
  }

  const scrollTo = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    document.getElementById(id)?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    })
  }

  const openDemo = () => {
    setDemoActive(true)
    window.requestAnimationFrame(() => scrollTo("demo"))
  }

  const focusStart = () => {
    scrollTo("start")
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400
    window.setTimeout(
      () => benchmarkButtonRef.current?.focus({ preventScroll: true }),
      delay
    )
  }

  if (route === "processing") {
    return (
      <div className="app app-process">
        <ProcessingPage
          fileName={state.sourceLabel || state.sourceFile?.name || "Your file"}
          progress={state.scanProgress}
          error={state.error}
          onCancel={goLanding}
        />
      </div>
    )
  }

  if (route === "workspace") {
    return (
      <div className="app app-results">
        <header className="results-topbar">
          <a
            className="brand"
            href="/"
            aria-label="SOFIDR home"
            onClick={(e) => {
              e.preventDefault()
              goLanding()
            }}
          >
            <span className="brand-mark" aria-hidden="true">
              S
            </span>
            <span>SOFIDR</span>
          </a>
          <p className="results-topbar-note">Session only · nothing stored</p>
        </header>
        <main className="app-main results-main">
          <ResultsWorkspace
            page={workspacePage}
            onPageChange={setWorkspacePage}
            cleaning={state.cleaning}
            profile={state.profile}
            optimize={state.result}
            strategyNote={state.strategyNote}
            sourceFile={state.sourceFile}
            sourceName={state.sourceLabel || "Uploaded dataset"}
            scanLog={state.scanLog}
            onBack={goLanding}
            onReset={goLanding}
          />
        </main>
        <footer className="app-footer compact">
          <p className="footer-copy">© 2026 Jayasaagar C</p>
          <nav className="footer-links" aria-label="Connect">
            <a
              className="footer-linkedin"
              href="https://www.linkedin.com/in/jayasaagarc/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Jayasaagar C on LinkedIn"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                />
              </svg>
            </a>
          </nav>
        </footer>
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="nav landing-nav sticky-nav" aria-label="Primary navigation">
        <a className="brand" href="#explain" aria-label="SOFIDR home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SOFIDR</span>
        </a>
        <div className="nav-links">
          <a href="#explain">Explain SOFIDR</a>
          <a href="#problem">Problem</a>
          <a href="#solution">Solution</a>
          <a href="#demo">Demo</a>
          <a href="#start" className="nav-start">
            Start
          </a>
        </div>
      </nav>

      <header className="app-header landing-header">
        <section className="hero intro-hero" id="explain" aria-labelledby="explain-heading">
          <p className="eyebrow intro-fade">Adaptive data preparation</p>
          <h1 className="intro-title" id="explain-heading">
            <span className="intro-brand">SOFIDR</span>
          </h1>
          <p className="intro-expand intro-fade-delay">
            Strategic Optimization Framework for Iterative Data Regeneration
          </p>
          <p className="tagline intro-fade-delay-2">
            Read the data terrain, clean it, score six preparation formations with the Strategic
            Efficiency Index, and turn the right charts into business insights — in one session,
            nothing persisted.
          </p>
          <div className="hero-actions intro-fade-delay-3">
            <a className="hero-cta" href="#problem">
              See the problem <span aria-hidden="true">↓</span>
            </a>
            <a className="hero-secondary" href="#start">
              Run analysis
            </a>
          </div>
        </section>
      </header>

      <section className="landing-block" id="problem" aria-labelledby="problem-heading">
        <div className="landing-inner">
          <p className="eyebrow">Problem</p>
          <h2 id="problem-heading">Uncurated extracts break analytics trust.</h2>
          <p>
            Alias drift (US / USA / United States), duplicates, missingness, and skewed numerics
            silently bias KPIs and models. Analysts spend cycles reconciling frames instead of
            validating signal.
          </p>
        </div>
      </section>

      <section className="landing-block landing-block-soft" id="solution" aria-labelledby="solution-heading">
        <div className="landing-inner">
          <p className="eyebrow">Solution</p>
          <h2 id="solution-heading">Curate → explore → brief.</h2>
          <p>
            SOFIDR applies structured cleaning tactics, surfaces EDA (correlations, skew, outliers),
            and packages conclusions for stakeholders — Word or PDF, editable when you need it.
          </p>
          <ul className="landing-points">
            <li>
              <strong>Dataset</strong>
              <span>Before/after preview and curated export.</span>
            </li>
            <li>
              <strong>Analytics</strong>
              <span>Derived insight cards, segment mix, heatmaps, skew, IQR outliers.</span>
            </li>
            <li>
              <strong>Report</strong>
              <span>Business insights summarized from Analytics, plus next actions.</span>
            </li>
          </ul>
          <button type="button" className="landing-inline-link" onClick={openDemo}>
            Watch the pipeline demo ↓
          </button>
        </div>
      </section>

      <GuidedProcessDemo active={demoActive} onChooseBenchmark={focusStart} />

      <main className="app-main landing-start" id="start">
        <div className="input-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>Upload a frame or run a benchmark archetype.</h2>
            </div>
            <p>
              Processing shows the tactic breakdown (~5s), then opens Dataset → Analytics →
              Report as dedicated pages for analyst review.
            </p>
          </div>
          <div className="input-container">
            <FileUploader loading={state.loading} onUpload={handleFileUpload} />
            <div className="divider" aria-hidden="true">
              <span>or try an example</span>
            </div>
            <ArchetypeSelector
              archetypes={state.archetypes}
              loading={state.loading}
              onSelect={handleArchetypeSelect}
              firstButtonRef={benchmarkButtonRef}
            />
          </div>

          {state.error && route === "landing" && (
            <div className="error-message" role="alert">
              {state.error}
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="footer-brand">
          <p>SOFIDR</p>
          <p className="footer-copy">© 2026 Jayasaagar C · Session-only processing</p>
        </div>
        <nav className="footer-links" aria-label="Connect">
          <a
            className="footer-linkedin"
            href="https://www.linkedin.com/in/jayasaagarc/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Jayasaagar C on LinkedIn"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
              />
            </svg>
          </a>
          <button type="button" className="footer-text-btn" onClick={openDemo}>
            Demo
          </button>
        </nav>
      </footer>
    </div>
  )
}
