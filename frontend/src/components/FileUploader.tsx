import React, { useRef, useState } from "react"
import { Button } from "./ui/Button"
import {
  LOCAL_FILE_LIMIT,
  SERVER_BODY_LIMIT,
  isLocalTabularCandidate,
} from "../lib/localClean"

const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt", ".xlsx", ".xlsm", ".json"]

interface FileUploaderProps {
  loading: boolean
  onUpload: (file: File) => void
}

export default function FileUploader({ loading, onUpload }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndUpload = (file: File) => {
    setError("")
    const lower = file.name.toLowerCase()
    const allowed =
      ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
      [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ].includes(file.type)
    if (!allowed) {
      setError("Upload CSV, TSV, Excel (.xlsx), or JSON.")
      return
    }

    const tabular = isLocalTabularCandidate(file)
    if (tabular && file.size > LOCAL_FILE_LIMIT) {
      setError(
        "This CSV/TSV is larger than 250 MB. Split it or export a smaller extract, then try again."
      )
      return
    }
    if (!tabular && file.size > SERVER_BODY_LIMIT) {
      setError(
        "Excel and JSON are limited to about 3.5 MB here. For large data, export CSV or TSV — those can be cleaned locally up to ~1 million rows."
      )
      return
    }
    onUpload(file)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === "dragenter" || e.type === "dragover")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      validateAndUpload(files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      validateAndUpload(e.target.files[0])
      e.target.value = ""
    }
  }

  return (
    <div className="file-uploader">
      <div className="panel-heading">
        <div>
          <p className="option-label">Option 1</p>
          <h3>Clean and improve your dataset</h3>
          <p>
            Upload a file and get a clearer, cleaner version back. Small files use the
            quick path; large CSV/TSV files are cleaned in your browser — up to about a
            million rows.
          </p>
        </div>
      </div>
      <div
        className={`drop-zone ${dragActive ? "active" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        aria-describedby="file-requirements"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xlsm,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleChange}
          disabled={loading}
          hidden
        />
        <div className="drop-content">
          <div className="upload-icon" aria-hidden="true">
            <svg className="drop-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
          <strong>Drop your file here</strong>
          <p>or choose it from your device</p>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            variant="secondary"
          >
            Choose file
          </Button>
        </div>
      </div>
      <p className="file-hint" id="file-requirements">
        <span>CSV · TSV · Excel · JSON</span>
        <span>CSV/TSV up to ~1M rows</span>
        <span>Session only — not stored</span>
      </p>
      <p className="file-output-note">
        You will watch each scan step, then download a cleaned file and a shareable summary.
      </p>
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  )
}
