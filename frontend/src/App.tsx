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
import AnalysisProgress from "./components/AnalysisProgress"
import AnalysisJourney from "./components/AnalysisJourney"
import {
  ScanProgress,
  buildClassificationSample,
  cleanLocally,
  needsLocalProcessing,
} from "./lib/localClean"
import "./App.css"

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
  processMode: "server" | "local" | null
}

export default function App() {
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
    processMode: null,
  })
  const [demoActive, setDemoActive] = useState(false)
  const benchmarkButtonRef = useRef<HTMLButtonElement>(null)
  const hasOutput = Boolean(state.cleaning || state.result)

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

  const handleArchetypeSelect = async (archetype: string) => {
    setState((s) => ({
      ...s,
      loading: true,
      error: "",
      sourceFile: null,
      cleaning: null,
      profile: null,
      scanProgress: null,
      processMode: "server",
      result: null,
    }))
    try {
      const result = await api.optimize({ archetype })
      setState((s) => ({ ...s, result, loading: false }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false }))
    }
  }

  const handleFileUpload = async (file: File) => {
    const useLocal = needsLocalProcessing(file)
    setState((s) => ({
      ...s,
      loading: true,
      error: "",
      sourceFile: file,
      result: null,
      cleaning: null,
      profile: null,
      scanProgress: null,
      processMode: useLocal ? "local" : "server",
    }))
    try {
      if (useLocal) {
        const { cleaning, profile } = await cleanLocally(file, {
          onProgress: (scanProgress) => setState((s) => ({ ...s, scanProgress })),
        })
        setState((s) => ({
          ...s,
          cleaning,
          profile,
          result: null,
          loading: false,
          error: "",
          scanProgress: null,
        }))
        return
      }

      const [profile, cleaning] = await Promise.all([
        api.profile(file),
        api.clean(file, "csv"),
      ])
      cleaning.metadata.processingMode = "server"
      setState((s) => ({
        ...s,
        cleaning,
        profile,
        result: null,
        loading: false,
        error: "",
        scanProgress: null,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false, scanProgress: null }))
    }
  }

  const handleUploadedStrategy = async (targetColumn: string) => {
    if (!state.sourceFile) return
    setState((s) => ({
      ...s,
      loading: true,
      error: "",
      result: null,
      processMode: state.processMode || "server",
    }))
    try {
      const fileForOptimize =
        state.processMode === "local"
          ? await buildClassificationSample(state.sourceFile)
          : state.sourceFile
      const result = await api.optimize({
        file: fileForOptimize,
        target_column: targetColumn,
      })
      if (state.processMode === "local") {
        result.selection_reason = [
          result.selection_reason,
          "Compared on a sample of this large file; your full cleaned download is unchanged.",
        ]
          .filter(Boolean)
          .join(" ")
      }
      setState((s) => ({ ...s, result, loading: false }))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "SOFIDR could not evaluate this target"
      setState((s) => ({ ...s, error: message, loading: false }))
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

  const resetAnalysis = () => {
    setState((s) => ({
      ...s,
      loading: false,
      error: "",
      result: null,
      sourceFile: null,
      cleaning: null,
      profile: null,
      scanProgress: null,
      processMode: null,
    }))
    window.requestAnimationFrame(() => scrollTo("start"))
  }

  if (hasOutput) {
    return (
      <div className="app app-results">
        <header className="results-topbar">
          <a className="brand" href="/" aria-label="SOFIDR home">
            <span className="brand-mark" aria-hidden="true">
              S
            </span>
            <span>SOFIDR</span>
          </a>
          <p className="results-topbar-note">Session only · nothing stored</p>
        </header>
        <main className="app-main results-main">
          <AnalysisJourney
            cleaning={state.cleaning}
            profile={state.profile}
            optimize={state.result}
            sourceFile={state.sourceFile}
            sourceName={
              state.sourceFile?.name || state.result?.dataset_name || "Uploaded dataset"
            }
            onReset={resetAnalysis}
            onRunStrategy={state.sourceFile ? handleUploadedStrategy : undefined}
            strategyLoading={state.loading && Boolean(state.cleaning)}
            strategyError={state.error}
          />
        </main>
        <footer className="app-footer compact">
          <p className="footer-copy">© 2026 Jayasaagar C</p>
          <nav className="footer-links" aria-label="Connect">
            <a
              href="https://www.linkedin.com/in/jayasaagar-c"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
            <a
              href="https://github.com/jayasaagar21"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </footer>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header landing-header">
        <nav className="nav landing-nav" aria-label="Primary navigation">
          <a className="brand" href="/" aria-label="SOFIDR home">
            <span className="brand-mark" aria-hidden="true">
              S
            </span>
            <span>SOFIDR</span>
          </a>
          <div className="nav-links">
            <a href="#problem">Problem</a>
            <a href="#solution">Solution</a>
            <a href="#demo">Demo</a>
            <a href="#start" className="nav-start">
              Start
            </a>
          </div>
        </nav>

        <div className="hero" id="problem">
          <p className="eyebrow">Chapter 0 · The problem</p>
          <h1>
            Messy data
            <br />
            slows decisions.
          </h1>
          <p className="tagline">
            Spreadsheets arrive with blanks, duplicates, and unclear fields. Teams argue over
            numbers instead of acting on them — and nobody trusts the file enough to decide.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={openDemo}>
              Watch the story <span aria-hidden="true">↓</span>
            </button>
            <a className="hero-secondary" href="#start">
              Skip to start
            </a>
          </div>
        </div>
      </header>

      <section className="landing-block" id="solution" aria-labelledby="solution-heading">
        <div className="landing-inner">
          <p className="eyebrow">Then · The solution</p>
          <h2 id="solution-heading">Turn that file into a decision story.</h2>
          <p>
            SOFIDR takes the messy upload and walks it forward: repair the dataset, show what
            matters visually, then hand you a report you can edit and share — all in one session,
            with nothing stored afterward.
          </p>
          <ul className="landing-points">
            <li>
              <strong>Dataset</strong>
              <span>A cleaner file you can preview and download.</span>
            </li>
            <li>
              <strong>Visualization</strong>
              <span>Charts that make risk and improvement obvious.</span>
            </li>
            <li>
              <strong>Report</strong>
              <span>Insights as Word or PDF — ready to brief someone.</span>
            </li>
          </ul>
          <button type="button" className="landing-inline-link" onClick={openDemo}>
            See how the story plays out ↓
          </button>
        </div>
      </section>

      <GuidedProcessDemo active={demoActive} onChooseBenchmark={focusStart} />

      <main className="app-main landing-start" id="start">
        <div className="input-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your turn</p>
              <h2>Now run the same story on your data.</h2>
            </div>
            <p>
              Upload a file or pick an example. You’ll land on one results page — dataset,
              visualization, report — connected exactly as the demo showed.
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

          {state.error && (
            <div className="error-message" role="alert">
              {state.error}
            </div>
          )}

          {state.loading && (
            <AnalysisProgress
              progress={state.scanProgress}
              fileName={state.sourceFile?.name}
              mode={state.processMode || "auto"}
            />
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
            href="https://www.linkedin.com/in/jayasaagar-c"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/jayasaagar21"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <button type="button" className="footer-text-btn" onClick={openDemo}>
            Demo
          </button>
        </nav>
      </footer>
    </div>
  )
}
