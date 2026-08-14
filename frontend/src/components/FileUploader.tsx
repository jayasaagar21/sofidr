import React, { useRef, useState } from "react"
import { Button } from "./ui/Button"

const MAX_FILE_SIZE = 4 * 1024 * 1024
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
      ["text/csv", "text/tab-separated-values", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(
        file.type
      )
    if (!allowed) {
      setError("Upload CSV, TSV, Excel (.xlsx), or JSON.")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("This file is larger than 4 MB. Choose a smaller file for the current deployment limits.")
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
          <p>Upload a file and get a clearer, cleaner version back. You do not need to choose a target column.</p>
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
        <span>4 MB maximum</span>
        <span>No setup required</span>
      </p>
      <p className="file-output-note">
        You will see what was improved, then download CSV, Excel, or JSON.
      </p>
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  )
}
