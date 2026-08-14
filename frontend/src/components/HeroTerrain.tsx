import Lottie from "lottie-react"
import orbitAnimation from "../assets/sofidr-orbit.json"

export default function HeroTerrain() {
  return (
    <div className="hero-terrain" aria-label="Animated SOFIDR terrain visualization">
      <Lottie
        animationData={orbitAnimation}
        loop
        aria-hidden="true"
        rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
      />
      <div className="hero-terrain-core">
        <span>SOFIDR</span>
        <strong>Phase 0–2</strong>
      </div>
      <div className="terrain-callout terrain-callout-top">
        <span className="terrain-dot" />
        Terrain
      </div>
      <div className="terrain-callout terrain-callout-bottom">
        <span className="terrain-dot" />
        SEI
      </div>
    </div>
  )
}
