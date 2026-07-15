import React, { useState, useEffect } from "react"
import { api, OptimizeResponse, Archetype, Formation } from "./api"
import ArchetypeSelector from "./components/ArchetypeSelector"
import FileUploader from "./components/FileUploader"
import ResultsDisplay from "./components/ResultsDisplay"
import "./App.css"

interface AppState {
  loading: boolean
  error: string
  result: OptimizeResponse | null
  archetypes: Archetype
  formations: Formation
}

export default function App() {
  const [state, setState] = useState<AppState>({
    loading: false,
    error: "",
    result: null,
    archetypes: {},
    formations: {},
  })

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
    setState((s) => ({ ...s, loading: true, error: "" }))
    try {
      const result = await api.optimize({ archetype })
      setState((s) => ({ ...s, result, loading: false }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false }))
    }
  }

  const handleFileUpload = async (file: File) => {
    setState((s) => ({ ...s, loading: true, error: "" }))
    try {
      const result = await api.optimize({ file })
      setState((s) => ({ ...s, result, loading: false }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setState((s) => ({ ...s, error: msg, loading: false }))
    }
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
          <div className="hero-proof" aria-label="SOFIDR methodology">
            <span><strong>8</strong> formations</span>
            <span><strong>4</strong> decision metrics</span>
            <span><strong>0</strong> test-fold leakage</span>
          </div>
        </div>
      </header>

      <main className="app-main" id="analysis">
        {state.result ? (
          <ResultsDisplay
            result={state.result}
            formations={state.formations}
            onReset={() => setState((s) => ({ ...s, result: null }))}
          />
        ) : (
          <div className="input-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Start an analysis</p>
                <h2>Bring a dataset or explore a terrain.</h2>
              </div>
              <p>
                Your upload is processed for this request only. SOFIDR evaluates
                numeric features and treats the final column as the target.
              </p>
            </div>
            <div className="input-container">
              <ArchetypeSelector
                archetypes={state.archetypes}
                loading={state.loading}
                onSelect={handleArchetypeSelect}
              />
              <div className="divider" aria-hidden="true"><span>or</span></div>
              <FileUploader loading={state.loading} onUpload={handleFileUpload} />
            </div>

            {state.error && <div className="error-message" role="alert">{state.error}</div>}

            {state.loading && (
              <div className="loading-container" role="status" aria-live="polite">
                <div className="spinner"></div>
                <div>
                  <strong>Testing formations</strong>
                  <p>Scoring accuracy, stability, retention, and simplicity.</p>
                </div>
              </div>
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
