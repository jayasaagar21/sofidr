import React, { useState, useEffect, useRef } from "react"
import { api, OptimizeResponse, Archetype, Formation, EnhanceResponse, CleanResponse } from "./api"
import ArchetypeSelector from "./components/ArchetypeSelector"
import FileUploader from "./components/FileUploader"
import ResultsDisplay from "./components/ResultsDisplay"
import GuidedProcessDemo from "./components/GuidedProcessDemo"
import AnalysisProgress from "./components/AnalysisProgress"
import CleaningResultsDisplay from "./components/CleaningResultsDisplay"
import "./App.css"

interface AppState {
  loading: boolean
  error: string
  result: OptimizeResponse | null
  archetypes: Archetype
  formations: Formation
  sourceFile: File | null
  enhancement: EnhanceResponse | null
  enhancementLoading: boolean
  enhancementError: string
  cleaning: CleanResponse | null
}

export default function App() {
  const [state, setState] = useState<AppState>({
    loading: false,
    error: "",
    result: null,
    archetypes: {},
    formations: {},
    sourceFile: null,
    enhancement: null,
    enhancementLoading: false,
    enhancementError: "",
    cleaning: null,
  })
  const [demoActive, setDemoActive] = useState(false)
  const benchmarkButtonRef = useRef<HTMLButtonElement>(null)

  // Load metadata on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [archetypes, formations] = await Promise.all([
          api.listArchetypes(),
          api.listFormations(),
        ])
        setState((s) => ({ ...s, archetypes, formations }))
      } catch (err) {
        console.error("Failed to load metadata:", err)
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
      enhancement: null,
      enhancementLoading: false,
      enhancementError: "",
      cleaning: null,
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
    setState((s) => ({
      ...s,
      loading: true,
      error: "",
      sourceFile: file,
      enhancement: null,
      enhancementLoading: false,
      enhancementError: "",
      cleaning: null,
    }))
    try {
      const result = await api.optimize({ file })
      setState((s) => ({
        ...s,
        result,
        loading: false,
        enhancementLoading: result.success,
      }))
      if (!result.success) return

      try {
        const enhancement = await api.enhance(file, result.best_by_sei)
        setState((s) => ({ ...s, enhancement, enhancementLoading: false }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        setState((s) => ({
          ...s,
          enhancementError: msg,
          enhancementLoading: false,
        }))
      }
    } catch (optimizationError) {
      try {
        const cleaning = await api.clean(file)
        setState((s) => ({
          ...s,
          result: null,
          cleaning,
          loading: false,
          error: "",
        }))
      } catch (cleaningError) {
        const optimizeMessage =
          optimizationError instanceof Error ? optimizationError.message : "analysis failed"
        const cleanMessage =
          cleaningError instanceof Error ? cleaningError.message : "cleaning failed"
        setState((s) => ({
          ...s,
          error: `SOFIDR could not analyze or clean this file. ${optimizeMessage}; ${cleanMessage}`,
          loading: false,
        }))
      }
    }
  }

  const exploreBenchmark = () => {
    setDemoActive(true)
    window.requestAnimationFrame(() => {
      document.getElementById("process-demo")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      })
    })
  }

  const focusBenchmarkPicker = () => {
    document.getElementById("analysis")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    })
    const focusDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450
    window.setTimeout(() => benchmarkButtonRef.current?.focus({ preventScroll: true }), focusDelay)
  }

  const resetAnalysis = () => {
    setState((s) => ({
      ...s,
      loading: false,
      error: "",
      result: null,
      sourceFile: null,
      enhancement: null,
      enhancementLoading: false,
      enhancementError: "",
      cleaning: null,
    }))
  }

  return (
    <div className="app">
      <header className="app-header">
        <nav className="nav" aria-label="Primary navigation">
          <a className="brand" href="/" aria-label="SOFIDR home">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span>SOFIDR</span>
          </a>
          <div className="nav-meta">
            <span className="status-dot" aria-hidden="true"></span>
            Analysis engine online
          </div>
        </nav>
        <div className="hero">
          <p className="eyebrow">Classification preprocessing intelligence</p>
          <h1>Choose a data strategy<br />you can defend.</h1>
          <p className="tagline">
            Compare eight leak-resistant preprocessing formations against the same
            cross-validation folds. Get a ranked recommendation in seconds.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={exploreBenchmark}>
              Explore Benchmark <span aria-hidden="true">↓</span>
            </button>
            <span>Follow the four-stage evidence trail</span>
          </div>
          <div className="hero-proof" aria-label="SOFIDR methodology">
            <span><strong>8</strong> formations</span>
            <span><strong>4</strong> decision metrics</span>
            <span><strong>0</strong> test-fold leakage</span>
          </div>
        </div>
      </header>

      <GuidedProcessDemo active={demoActive} onChooseBenchmark={focusBenchmarkPicker} />

      <main className="app-main" id="analysis">
        {state.cleaning ? (
          <CleaningResultsDisplay
            result={state.cleaning}
            sourceName={state.sourceFile?.name || "Uploaded dataset"}
            onReset={resetAnalysis}
          />
        ) : state.result ? (
          <ResultsDisplay
            result={state.result}
            formations={state.formations}
            enhancement={state.enhancement}
            enhancementLoading={state.enhancementLoading}
            enhancementError={state.enhancementError}
            isUploadedFile={Boolean(state.sourceFile)}
            onReset={resetAnalysis}
          />
        ) : (
          <div className="input-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Start an analysis</p>
                <h2>Bring a dataset or explore a terrain.</h2>
              </div>
              <p>
                Your upload is processed for this request only. SOFIDR optimizes
                classification data and falls back to safe cleaning for mixed datasets.
              </p>
            </div>
            <div className="input-container">
              <ArchetypeSelector
                archetypes={state.archetypes}
                loading={state.loading}
                onSelect={handleArchetypeSelect}
                firstButtonRef={benchmarkButtonRef}
              />
              <div className="divider" aria-hidden="true"><span>or</span></div>
              <FileUploader loading={state.loading} onUpload={handleFileUpload} />
            </div>

            {state.error && <div className="error-message" role="alert">{state.error}</div>}

            {state.loading && (
              <AnalysisProgress />
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>SOFIDR · Strategic Optimization Framework for Iterative Data Regeneration</p>
        <p>
          <a href="https://github.com/jayasaagar21/sofidr" target="_blank" rel="noopener noreferrer">
            Source code
          </a>
        </p>
      </footer>
    </div>
  )
}
