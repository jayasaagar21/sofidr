import React, { useState, useEffect, useRef } from "react"
import { api, OptimizeResponse, Archetype, Formation, EnhanceResponse, CleanResponse, DatasetProfile } from "./api"
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
  profile: DatasetProfile | null
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
    profile: null,
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
      profile: null,
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
      result: null,
      enhancement: null,
      enhancementLoading: false,
      enhancementError: "",
      cleaning: null,
      profile: null,
    }))
    try {
      // Profiling measures dataset conditions without changing the dataset.
      // The human-cleaning artifact remains a separate, explicit output.
      const [profile, cleaning] = await Promise.all([
        api.profile(file),
        api.clean(file, "csv"),
      ])
      setState((s) => ({
        ...s,
        cleaning,
        profile,
        result: null,
        loading: false,
        error: "",
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false }))
    }
  }

  const handleUploadedStrategy = async (targetColumn: string) => {
    if (!state.sourceFile) return
    setState((s) => ({
      ...s,
      loading: true,
      error: "",
      result: null,
      enhancement: null,
      enhancementError: "",
    }))
    try {
      const result = await api.optimize({ file: state.sourceFile, target_column: targetColumn })
      setState((s) => ({ ...s, result, loading: false }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "SOFIDR could not evaluate this target"
      setState((s) => ({ ...s, error: message, loading: false }))
    }
  }

  const handleApplyRecommendation = async () => {
    if (!state.sourceFile || !state.result) return
    setState((s) => ({ ...s, enhancementLoading: true, enhancementError: "" }))
    try {
      const enhancement = await api.enhance(
        state.sourceFile,
        state.result.best_by_sei,
        state.result.target_column,
      )
      setState((s) => ({ ...s, enhancement, enhancementLoading: false }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "SOFIDR could not apply the recommended formation"
      setState((s) => ({ ...s, enhancementError: message, enhancementLoading: false }))
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
      profile: null,
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
          <p className="eyebrow">Make your data easier to use</p>
          <h1>Start with cleaner data.<br />Make better decisions.</h1>
          <p className="tagline">
            Upload a spreadsheet to find and fix common data problems. If your data
            includes categories to predict, SOFIDR can also compare the best ways to prepare it.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={exploreBenchmark}>
              See an example <span aria-hidden="true">↓</span>
            </button>
            <span>Clear results · downloadable files</span>
          </div>
          <div className="hero-proof" aria-label="SOFIDR methodology">
            <span><strong>CSV, Excel & JSON</strong> supported</span>
            <span><strong>Your file</strong> stays in this session</span>
            <span><strong>Clear results</strong> at every step</span>
          </div>
        </div>
      </header>

      <section className="intro" aria-labelledby="intro-heading">
        <div className="intro-inner">
          <p className="eyebrow">How it helps</p>
          <h2 id="intro-heading">Better data, without the guesswork.</h2>
          <p>
            SOFIDR — Strategic Optimization Framework for Iterative Data Regeneration —
            helps you understand, clean, and improve your data. It shows what it found,
            what changed, and gives you a ready-to-download result.
          </p>
        </div>
      </section>

      <GuidedProcessDemo active={demoActive} onChooseBenchmark={focusBenchmarkPicker} />

      <main className="app-main" id="analysis">
        {state.cleaning ? (
          <CleaningResultsDisplay
            result={state.cleaning}
            sourceFile={state.sourceFile}
            sourceName={state.sourceFile?.name || "Uploaded dataset"}
            profile={state.profile}
            analysisLoading={state.loading}
            analysisError={state.error}
            onRunStrategy={handleUploadedStrategy}
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
            profile={state.profile}
            onApplyRecommendation={handleApplyRecommendation}
            onReset={resetAnalysis}
          />
        ) : (
          <div className="input-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Start here</p>
                <h2>Choose what you want to do.</h2>
              </div>
              <p>
                Start with your own file to clean and improve it, or try a prepared
                example to see how SOFIDR works before uploading anything.
              </p>
            </div>
            <div className="input-container">
              <FileUploader loading={state.loading} onUpload={handleFileUpload} />
              <div className="divider" aria-hidden="true"><span>or try an example</span></div>
              <ArchetypeSelector
                archetypes={state.archetypes}
                loading={state.loading}
                onSelect={handleArchetypeSelect}
                firstButtonRef={benchmarkButtonRef}
              />
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
        <p className="footer-copy">© 2026 Jayasaagar C</p>
      </footer>
    </div>
  )
}
