import React, { useEffect, useRef } from "react"
import { Button } from "./ui/Button"

interface GuidedProcessDemoProps {
  active: boolean
  onChooseBenchmark: () => void
}

/** Single practical demo strip — no repeated Dataset/Viz/Report marketing. */
export default function GuidedProcessDemo({
  active,
  onChooseBenchmark,
}: GuidedProcessDemoProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (active) headingRef.current?.focus({ preventScroll: true })
  }, [active])

  return (
    <section
      className={`process-demo demo-simple ${active ? "is-active" : ""}`}
      id="demo"
      aria-labelledby="process-title"
    >
      <div className="process-intro">
        <p className="eyebrow">Demo</p>
        <h2 id="process-title" ref={headingRef} tabIndex={-1}>
          See it once, then try your file.
        </h2>
        <p>
          Pick a prepared example to walk the full results page — cleaned output, charts, and a
          report you can download — without uploading anything yet.
        </p>
        <Button onClick={onChooseBenchmark}>
          Try an example <span aria-hidden="true">↓</span>
        </Button>
      </div>
    </section>
  )
}
