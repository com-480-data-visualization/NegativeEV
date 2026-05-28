/**
 * Top-level page. Pure structural component: declares the sticky nav, the
 * ordered narrative sections, and the footer.
 *
 * The reading order is intentional: Hero hooks → Intro defines the
 * vocabulary → Calibration shows the headline visualisation (described,
 * not concluded) → four "rewind" sections (Dataset → Activity → Prices →
 * Streaks) prune every "easy" alternative explanation → Convergence reads
 * the surface back as a 2D companion → Verdict synthesises → Playground
 * hands the findings to the reader.
 *
 * Intro and Verdict are silent connectors (Intro carries `id="intro"`
 * only as a chevron scroll target; Verdict has no id at all) so the
 * scroll-spy stays anchored on the chart-bearing sections.
 */
import Footer from './components/layout/Footer'
import NavHeader from './components/layout/NavHeader'
import HeroSection from './components/sections/HeroSection'
import IntroSection from './components/sections/IntroSection'
import CalibrationSection from './components/sections/CalibrationSection'
import StatisticsSection from './components/sections/StatisticsSection'
import TemporalSection from './components/sections/TemporalSection'
import DistributionsSection from './components/sections/DistributionsSection'
import MarkovSection from './components/sections/MarkovSection'
import CalibrationOverTimeSection from './components/sections/CalibrationOverTimeSection'
import VerdictSection from './components/sections/VerdictSection'
import PlaygroundSection from './components/sections/PlaygroundSection'

export default function App() {
  return (
    <div className="min-h-svh bg-surface font-sans text-gray-100">
      <NavHeader />

      <main>
        <HeroSection />
        <IntroSection />
        <CalibrationSection />
        <StatisticsSection />
        <TemporalSection />
        <DistributionsSection />
        <MarkovSection />
        <CalibrationOverTimeSection />
        <VerdictSection />
        <PlaygroundSection />
      </main>

      <Footer />
    </div>
  )
}
