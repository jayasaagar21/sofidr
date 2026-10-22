import React, { useState, useEffect, useRef } from "react"
import { api, OptimizeResponse, Archetype, Formation, EnhanceResponse, CleanResponse, DatasetProfile } from "./api"
import ArchetypeSelector from "./components/ArchetypeSelector"
import FileUploader from "./components/FileUploader"
import ResultsDisplay from "./components/ResultsDisplay"
import GuidedProcessDemo from "./components/GuidedProcessDemo"
import AnalysisProgress from "./components/AnalysisProgress"
import CleaningResultsDisplay from "./components/CleaningResultsDisplay"
import PrivacyTrust from "./components/PrivacyTrust"
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
  enhancement: EnhanceResponse | null
  enhancementLoading: boolean
  enhancementError: string
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
    enhancement: null,
    enhancementLoading: false,
    enhancementError: "",
    cleaning: null,
    profile: null,
    scanProgress: null,
    processMode: null,
  })
  const [demoActive, setDemoActive] = useState(false)
  const benchmarkButtonRef = useRef<HTMLButtonElement>(null)

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
      scanProgress: null,
      processMode: "server",
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
      enhancement: null,
      enhancementLoading: false,
      enhancementError: "",
      cleaning: null,
      profile: null,
      scanProgress: null,
      processMode: useLocal ? "local" : "server",
    }))
    try {
      if (useLocal) {
        const { cleaning, profile } = await cleanLocally(file, {
          onProgress: (scanProgress) =>
            setState((s) => ({ ...s, scanProgress })),
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
      enhancement: null,
      enhancementError: "",
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
          "Compared on a stratified sample of this large file so classification stays fast; your full cleaned CSV is still the download above.",
        ]
          .filter(Boolean)
          .join(" ")
      }
      setState((s) => ({ ...s, result, loading: false }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "SOFIDR could not evaluate this target"
      setState((s) => ({ ...s, error: message, loading: false }))
    }
  }

  const handleApplyRecommendation = async () => {
    if (!state.sourceFile || !state.result) return
    if (state.processMode === "local") {
      setState((s) => ({
        ...s,
        enhancementError:
          "For large local cleans, download the cleaned CSV above. Formation re-apply on the full million-row file stays in your browser export.",
      }))
      return
    }
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
      scanProgress: null,
      processMode: null,
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
            Ready · session-only processing
          </div>
        </nav>
        <div className="hero">
          <p className="eyebrow">Make your data easier to use</p>
          <h1>Start with cleaner data.<br />Make better decisions.</h1>
          <p className="tagline">
            Upload a spreadsheet. Watch SOFIDR scan it, clean it, and hand you a
            ready-to-download file — from small sheets to about a million CSV rows.
            Nothing is stored after you leave.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={exploreBenchmark}>
              See how it works <span aria-hidden="true">↓</span>
            </button>
            <a className="hero-secondary" href="#analysis">
              Clean a file
            </a>
          </div>
          <div className="hero-proof" aria-label="SOFIDR promises">
            <span><strong>Up to ~1M rows</strong> via CSV/TSV</span>
            <span><strong>Not stored</strong> after this session</span>
            <span><strong>Shareable</strong> result summary</span>
          </div>
        </div>
      </header>

      <PrivacyTrust />

      <section className="intro" aria-labelledby="intro-heading">
        <div className="intro-inner">
          <p className="eyebrow">How it helps</p>
          <h2 id="intro-heading">Better data, without the guesswork.</h2>
          <p>
            SOFIDR — Strategic Optimization Framework for Iterative Data Regeneration —
            shows what it scanned, what it fixed, and gives you a cleaned dataset you can
            download. Optional: compare preparation strategies when you have a category to predict.
          </p>
        </div>
      </section>

      <GuidedProcessDemo active={demoActive} onChooseBenchmark={focusBenchmarkPicker} />

      <section className="viz-marketing" id="visualize-story" aria-labelledby="viz-marketing-heading">
        <div className="viz-marketing-inner">
          <p className="eyebrow">Visualization & storytelling</p>
          <h2 id="viz-marketing-heading">From raw rows to a decision narrative.</h2>
          <p>
            After cleaning — and especially after comparing options — open{" "}
            <strong>Visualize</strong> for a full storytelling report: the business problem,
            optional repairs, why a preparation formation won under the paper’s SEI metric,
            charts across all six options, significant insights, and next action items.
          </p>
          <ol className="viz-marketing-steps" aria-label="Visualize story acts">
            <li>
              <strong>Problem</strong>
              <span>What the dataset is trying to say, and where risk lives.</span>
            </li>
            <li>
              <strong>Method</strong>
              <span>Terrain → Algorithm 1 cold-start → SEI scoreboard (paper weights).</span>
            </li>
            <li>
              <strong>Decision</strong>
              <span>Insights leaders can use, plus concrete next actions.</span>
            </li>
          </ol>
          <a className="hero-cta viz-marketing-cta" href="#analysis">
            Run an analysis, then Visualize
          </a>
        </div>
      </section>

      <main className="app-main" id="analysis">
        {state.cleaning && !state.result ? (
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
            cleaning={state.cleaning}
            sourceName={state.sourceFile?.name || state.result.dataset_name}
          />
        ) : (
          <div className="input-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Start here</p>
                <h2>Choose what you want to do.</h2>
              </div>
              <p>
                Start with your own file to scan and clean it, or try a prepared
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
              <AnalysisProgress
                progress={state.scanProgress}
                fileName={state.sourceFile?.name}
                mode={state.processMode || "auto"}
              />
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-brand">
          <p>SOFIDR · Strategic Optimization Framework for Iterative Data Regeneration</p>
          <p className="footer-copy">© 2026 Jayasaagar C · Your data is not stored after the session</p>
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
        </nav>
      </footer>
    </div>
  )
}
