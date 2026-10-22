import React from "react"

export default function PrivacyTrust() {
  return (
    <section className="privacy-trust" aria-labelledby="privacy-heading">
      <div className="privacy-trust-inner">
        <p className="eyebrow">Your data stays with you</p>
        <h2 id="privacy-heading">Upload → clean → download. Nothing is kept.</h2>
        <p>
          SOFIDR processes your file for this session only. There is no account vault and
          no long-term memory of your spreadsheet. When you leave or start over, the working
          copy is gone—keep the download if you need the cleaned result.
        </p>
        <ul className="privacy-points" aria-label="Privacy promises">
          <li>
            <strong>Session only</strong>
            <span>Processed while you are here, then discarded.</span>
          </li>
          <li>
            <strong>No saved copies</strong>
            <span>We do not store your dataset for later use.</span>
          </li>
          <li>
            <strong>Large files stay local</strong>
            <span>Bigger CSV/TSV files are cleaned in your browser.</span>
          </li>
        </ul>
      </div>
    </section>
  )
}
