import React, { useRef, useState } from "react"
import { Button } from "./ui/Button"

const MAX_FILE_SIZE = 4 * 1024 * 1024

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
    if (!(file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv"))) {
      setError("Please upload a CSV file.")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("This file is larger than 4 MB. Choose a smaller CSV.")
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
        <span className="step-number">02</span>
        <div>
          <h3>Analyze or clean your data</h3>
          <p>Classification files are optimized; mixed business datasets are cleaned automatically.</p>
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
          accept=".csv"
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
          <strong>Drop your CSV here</strong>
          <p>or select a file from your device</p>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            variant="secondary"
          >
            Choose CSV
          </Button>
        </div>
      </div>
      <p className="file-hint" id="file-requirements">
        <span>CSV only</span><span>4 MB maximum</span><span>Target column optional</span>
      </p>
      <p className="file-output-note">
        SOFIDR repairs malformed rows, duplicates, missing values, mixed types, dates, and common business fields.
      </p>
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  )
}
