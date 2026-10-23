import React, { useEffect, useId, useRef, useState } from "react"

interface InfoButtonProps {
  title: string
  children: React.ReactNode
  label?: string
  variant?: "info" | "why"
}

/** Eye / info control — opens a focused detail panel (not research jargon). */
export default function InfoButton({
  title,
  children,
  label = "How this works",
  variant = "info",
}: InfoButtonProps) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className={variant === "why" ? "info-eye info-why" : "info-eye"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={label}
      >
        <span className="sr-only">{label}</span>
        {variant === "why" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="12" cy="17" r="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </button>

      {open && (
        <div className="info-modal-root" role="presentation">
          <button
            type="button"
            className="info-modal-backdrop"
            aria-label="Close details"
            onClick={() => setOpen(false)}
          />
          <div
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="info-modal-header">
              <h2 id={titleId}>{title}</h2>
              <button
                ref={closeRef}
                type="button"
                className="info-modal-close"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>
            <div className="info-modal-body">{children}</div>
          </div>
        </div>
      )}
    </>
  )
}
