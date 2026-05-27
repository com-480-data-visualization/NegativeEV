import { useEffect, useRef, useState } from 'react'
import Playground from './components/Playground'

// ── Animated counter hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, delay = 0) {
  const [count, setCount] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
        setCount(eased * target)
        if (t < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }, delay)
    return () => {
      clearTimeout(timeout)
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay])

  return count
}

// ── Stat card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  value: number
  label: string
  suffix?: string
  decimals?: number
  delay?: number
  prefix?: string
}

function StatCard({ value, label, suffix = '', decimals = 0, delay = 0, prefix = '' }: StatCardProps) {
  const count = useCountUp(value, 1800, delay)
  const formatted = decimals > 0
    ? count.toFixed(decimals)
    : Math.round(count).toLocaleString()

  return (
    <div className="flex flex-col items-center gap-2 py-8 px-6 text-center">
      <span className="text-4xl font-bold tracking-tight text-white tabular-nums">
        {prefix}{formatted}{suffix}
      </span>
      <span className="text-sm text-muted leading-snug">{label}</span>
    </div>
  )
}

// ── Plot frame ───────────────────────────────────────────────────────────────
interface PlotFrameProps {
  src: string
  title: string
  height?: number
}

function PlotFrame({ src, title, height = 680 }: PlotFrameProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      className="relative rounded-2xl border border-border overflow-hidden"
      style={{ height, background: '#0f172a' }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-sm">Loading interactive chart…</span>
        </div>
      )}
      <iframe
        src={src}
        title={title}
        className="w-full h-full border-0"
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.4s' }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

// ── Section header ───────────────────────────────────────────────────────────
interface SectionHeaderProps {
  eyebrow?: string
  title: string
  description: string
}

function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{description}</p>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div className="min-h-svh bg-surface font-sans text-gray-100">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
          COM-480 · Data Visualization · EPFL 2026
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
          NegativeEV
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Do prediction markets really predict? We analyze{' '}
          <span className="font-semibold text-white">9,181 Polymarket BTC 5-minute markets</span>{' '}
          to uncover where crowd wisdom systematically falls short.
        </p>

        {/* Animated stats */}
        <div className="stat-grid mt-12 grid grid-cols-2 sm:grid-cols-4 rounded-2xl border border-border bg-surface-elevated overflow-hidden">
          <StatCard value={9181}  label="Prediction markets"    delay={0}   />
          <StatCard value={51.4}  label="UP outcome rate"       suffix="%" decimals={1} delay={200} />
          <StatCard value={300}   label="Seconds per market"    suffix=" s" delay={400} />
          <StatCard value={4719}  label="Eventual UP outcomes"  delay={600} />
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-6 py-14">
        <hr className="border-border" />
      </div>

      {/* ── Calibration surface ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <SectionHeader
          eyebrow="Analysis · Section 1"
          title="Calibration surfaces"
          description={
            `3D cumulative calibration surfaces across all ~7,000 markets. ` +
            `Each point shows what fraction of eventual-UP markets had their BTC price ` +
            `change at or below threshold Y at time T. Switch between Realized, Implied, ` +
            `and the calibration Gap to inspect where the market over- or under-prices UP outcomes. ` +
            `Drag to rotate · Scroll to zoom.`
          }
        />
        <PlotFrame
          src="/plots/up_cumulative_echarts3d.html"
          title="Cumulative calibration surface"
          height={720}
        />
      </section>

      {/* ── Trading playground ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-28">
        <SectionHeader
          eyebrow="Interactive · Section 2"
          title="Trading playground"
          description={
            `Replay 50 real BTC 5-minute markets sequentially. Buy and sell UP / DOWN tokens ` +
            `at live market prices. At the end of each 5-minute window the winning side pays out $1 ` +
            `per token — the other side pays $0. Your balance carries over between rounds.`
          }
        />
        <Playground />
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        <a
          href="https://negativeev.lovable.app/"
          className="text-accent underline-offset-4 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Previous prototype
        </a>
        <span className="mx-3 text-border">·</span>
        <span>COM-480 · EPFL · 2026</span>
      </footer>
    </div>
  )
}
