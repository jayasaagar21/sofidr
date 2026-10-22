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
    }))
    window.requestAnimationFrame(() => {
      document.getElementById("start")?.scrollIntoView({ block: "start" })
    })
  }

  const finishToWorkspace = (patch: Partial<AppState>) => {
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
      scanLog: ["Example selected", "Loading prepared dataset", "Running comparison"],
      processMode: "server",
      result: null,
      sourceLabel: archetype.replace(/_/g, " "),
    }))
    try {
      const result = await api.optimize({ archetype })
      finishToWorkspace({
        result,
        sourceLabel: result.dataset_name || archetype.replace(/_/g, " "),
        scanLog: [
          "Example selected",
          "Loading prepared dataset",
          "Running comparison",
          "Scoreboard ready",
        ],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false }))
    }
  }

  const handleFileUpload = async (file: File) => {
    const useLocal = needsLocalProcessing(file)
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
      scanLog: [`File added: ${file.name}`, "Opening document"],
      processMode: useLocal ? "local" : "server",
      sourceLabel: file.name,
    }))
    try {
      if (useLocal) {
        const { cleaning, profile } = await cleanLocally(file, {
          onProgress: (scanProgress) =>
            setState((s) => ({
              ...s,
              scanProgress,
              scanLog: pushLog(s.scanLog, scanProgress.detail),
            })),
        })
        finishToWorkspace({
          cleaning,
          profile,
          result: null,
          scanLog: [
            `File added: ${file.name}`,
            "Large-file path · cleaned in browser",
            "Issues scanned",
            "Repairs applied",
            "Preview prepared",
          ],
        })
        return
      }

      setState((s) => ({
        ...s,
        scanLog: pushLog(s.scanLog, "Profiling columns"),
      }))
      const [profile, cleaning] = await Promise.all([
        api.profile(file),
        api.clean(file, "csv"),
      ])
      cleaning.metadata.processingMode = "server"
      finishToWorkspace({
        cleaning,
        profile,
        result: null,
        scanLog: [
          `File added: ${file.name}`,
          "Reading structure",
          "Scanning for issues",
          "Repairing data",
          "Preparing preview",
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
      <header className="app-header landing-header">
        <nav className="nav landing-nav" aria-label="Primary navigation">
          <a className="brand" href="/" aria-label="SOFIDR home">
            <span className="brand-mark" aria-hidden="true">
              S
            </span>
            <span>SOFIDR</span>
          </a>
          <div className="nav-links">
            <a href="#intro">Intro</a>
            <a href="#problem">Problem</a>
            <a href="#solution">Solution</a>
            <a href="#demo">Demo</a>
            <a href="#start" className="nav-start">
              Start
            </a>
          </div>
        </nav>

        <div className="hero intro-hero" id="intro">
          <p className="eyebrow intro-fade">What is SOFIDR</p>
          <h1 className="intro-title">
            <span className="intro-brand">SOFIDR</span>
          </h1>
          <p className="intro-expand intro-fade-delay">
            Strategic Optimization Framework for Iterative Data Regeneration
          </p>
          <p className="tagline intro-fade-delay-2">
            SOFIDR cleans messy spreadsheets, shows what matters visually, and gives you a clear
            report. We built it so teams can trust their data and decide faster — in one session,
            with nothing stored afterward.
          </p>
          <div className="hero-actions intro-fade-delay-3">
            <a className="hero-cta" href="#problem">
              See the problem <span aria-hidden="true">↓</span>
            </a>
            <a className="hero-secondary" href="#start">
              Start now
            </a>
          </div>
        </div>
      </header>

      <section className="landing-block" id="problem" aria-labelledby="problem-heading">
        <div className="landing-inner">
          <p className="eyebrow">Problem</p>
          <h2 id="problem-heading">Messy data slows decisions.</h2>
          <p>
            Spreadsheets arrive with blanks, duplicates, and unclear fields. Teams argue over
            numbers instead of acting on them — and nobody trusts the file enough to decide.
          </p>
        </div>
      </section>

      <section className="landing-block landing-block-soft" id="solution" aria-labelledby="solution-heading">
        <div className="landing-inner">
          <p className="eyebrow">Solution</p>
          <h2 id="solution-heading">Clean the file. See the story. Take the report.</h2>
          <p>
            Upload once. SOFIDR repairs the dataset, highlights what matters in simple charts, and
            builds an insight report you can download as Word or PDF.
          </p>
          <ul className="landing-points">
            <li>
              <strong>Dataset</strong>
              <span>Preview and download a cleaner file.</span>
            </li>
            <li>
              <strong>Visualization</strong>
              <span>See issues and quality at a glance.</span>
            </li>
            <li>
              <strong>Report</strong>
              <span>Insights ready to share and edit.</span>
            </li>
          </ul>
          <button type="button" className="landing-inline-link" onClick={openDemo}>
            Watch the demo ↓
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
              Upload a file. You’ll see it scan step by step, then open Dataset, Visualization,
              and Report as separate pages.
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
