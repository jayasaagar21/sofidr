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
      setError("This CSV/TSV is larger than 250 MB. Try a smaller extract.")
      return
    }
    if (!tabular && file.size > SERVER_BODY_LIMIT) {
      setError(
        "Excel and JSON are limited to about 3.5 MB. For large data, export CSV or TSV."
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
    if (e.dataTransfer.files.length > 0) validateAndUpload(e.dataTransfer.files[0])
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
          <h3>Source dataset</h3>
          <p>
            Upload a tabular extract for profiling and cleaning. CSV/TSV scale higher; Excel and
            JSON stay under the API body limit.
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
          <strong>Drop dataset here</strong>
          <p>or select from disk</p>
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
        <span>Not stored after this session</span>
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
