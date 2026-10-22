/**
 * Client-side report export: editable Word (.doc) and print-ready PDF path.
 * Word uses HTML Word format so users can open and edit in Microsoft Word.
 */

import { StoryReport } from "./storyReport"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function buildReportHtml(story: StoryReport, sourceName: string): string {
  const insights = story.insights
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></li>`
    )
    .join("")

  const actions = story.actions
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><p><em>Owner: ${escapeHtml(item.owner)}</em></p></li>`
    )
    .join("")

  const changes = story.changes
    ? `<h2>What changed in the file</h2>
       <p>${escapeHtml(story.changes.summary)}</p>
       <ul>${story.changes.metrics
         .map((m) => `<li><strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(m.value)}</li>`)
         .join("")}</ul>`
    : ""

  const method = story.selection
    ? `<h2>How we prepared the data</h2>
       <p>Selected approach: <strong>${escapeHtml(story.selection.formation.replace(/_/g, " "))}</strong>${
         story.selection.sei != null ? ` (score ${story.selection.sei.toFixed(3)})` : ""
       }.</p>
       <p>${escapeHtml(story.selection.reason)}</p>
       <p>Fit for this data: ${escapeHtml(story.selection.paperTerrain)}.</p>
       <p>Steps used: ${escapeHtml(story.selection.techniques.join("; "))}.</p>`
    : ""

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SOFIDR report — ${escapeHtml(sourceName)}</title>
  <style>
    body { font-family: Calibri, Segoe UI, sans-serif; color: #1a1a1a; line-height: 1.55; max-width: 720px; margin: 2rem auto; padding: 0 1.25rem; }
    h1 { font-size: 1.75rem; margin-bottom: .35rem; }
    h2 { font-size: 1.2rem; margin-top: 1.75rem; border-bottom: 1px solid #ddd; padding-bottom: .35rem; }
    p, li { font-size: 11pt; }
    .meta { color: #555; margin-bottom: 1.5rem; }
    ul { padding-left: 1.2rem; }
    li { margin-bottom: .75rem; }
  </style>
</head>
<body>
  <h1>SOFIDR insight report</h1>
  <p class="meta">${escapeHtml(sourceName)} · Generated in-session · Editable in Microsoft Word</p>
  <h2>Problem</h2>
  <p>${escapeHtml(story.problem.statement)}</p>
  <p>${escapeHtml(story.problem.message)}</p>
  ${changes}
  ${method}
  <h2>Key insights</h2>
  <ul>${insights}</ul>
  <h2>Recommended next actions</h2>
  <ul>${actions}</ul>
  <p class="meta">This report summarizes the cleaned dataset view and visualizations. Raw rows are not included.</p>
</body>
</html>`
}

/** Editable Word document (opens in Microsoft Word). */
export function downloadWordReport(story: StoryReport, sourceName: string) {
  const body = buildReportHtml(story, sourceName)
  const wordHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <title>SOFIDR report</title>
</head>
<body>${body.match(/<body>([\s\S]*)<\/body>/)?.[1] || body}</body>
</html>`
  const blob = new Blob(["\ufeff", wordHtml], {
    type: "application/msword",
  })
  const safe = sourceName.replace(/[^\w.-]+/g, "_").slice(0, 48) || "dataset"
  downloadBlob(blob, `${safe}-sofidr-report.doc`)
}

/** HTML report for browsers / print-to-PDF. */
export function downloadHtmlReport(story: StoryReport, sourceName: string) {
  const html = buildReportHtml(story, sourceName)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const safe = sourceName.replace(/[^\w.-]+/g, "_").slice(0, 48) || "dataset"
  downloadBlob(blob, `${safe}-sofidr-report.html`)
}

/** Opens a print window so the user can Save as PDF. */
export function printReportAsPdf(story: StoryReport, sourceName: string) {
  const html = buildReportHtml(story, sourceName)
  const frame = window.open("", "_blank", "noopener,noreferrer,width=900,height=700")
  if (!frame) {
    downloadHtmlReport(story, sourceName)
    return
  }
  frame.document.open()
  frame.document.write(html)
  frame.document.close()
  frame.focus()
  window.setTimeout(() => {
    frame.print()
  }, 300)
}
