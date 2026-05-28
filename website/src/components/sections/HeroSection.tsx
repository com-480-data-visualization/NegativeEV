/**
 * Landing hero. Composes the title, intro copy, UP/DOWN gauge, animated
 * stats, date-range pill, and a scroll-down chevron.
 *
 * All numeric content is fed from /data/hero_stats.json so the front-end
 * stays in sync with whatever dataset the Python pipeline produced last.
 */
import HeroGauge from '../layout/HeroGauge'
import StatCard from '../layout/StatCard'
import { useHeroStats } from '../../lib/heroStats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Compact "Mon DD" rendering of a YYYY-MM-DD string (no timezone drift). */
function shortDay(iso: string | undefined): string {
  if (!iso) return '-'
  const [, m, d] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`
}

/** Year fragment of a YYYY-MM-DD string. */
function yearOf(iso: string | undefined): string {
  return iso ? iso.split('-')[0] : ''
}

interface DateRangeCardProps { start: string; end: string; year: string }

/** Static card cell that mirrors the StatCard layout but shows a date range
 *  instead of an animated number. Kept at module scope so the parent
 *  re-renders never remount this subtree. */
function DateRangeCard({ start, end, year }: DateRangeCardProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 px-3 text-center">
      <span className="text-xl sm:text-2xl font-bold tracking-tight text-white whitespace-nowrap tabular-nums">
        {start} <span className="text-accent mx-0.5">→</span> {end}
      </span>
      <span className="text-sm text-muted leading-snug">
        Data period{year ? ` · ${year}` : ''}
      </span>
    </div>
  )
}

export default function HeroSection() {
  const stats = useHeroStats()

  // Fallback values keep the layout filled while the JSON loads.
  const markets   = stats?.total_markets    ?? 0
  const volumeM   = (stats?.total_volume_usd ?? 0) / 1_000_000
  const days      = stats?.days_of_data     ?? 0
  const startDay  = shortDay(stats?.date_range.start)
  const endDay    = shortDay(stats?.date_range.end)
  const year      = yearOf(stats?.date_range.start)

  return (
    // Hero owns the full viewport height under the sticky 56-px NavHeader.
    // The flex column lets the scroll-down chevron pin to the bottom while
    // the main content (title + gauge + stats) flows naturally from the top.
    <section
      id="overview"
      className="mx-auto max-w-5xl px-6 pt-10 pb-6 flex flex-col min-h-[calc(100svh-3.5rem)]"
    >
      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent leading-relaxed">
          <div>COM-480 · Data Visualization · EPFL 2026 · Team NegativeEV</div>
          <div className="text-muted/80 normal-case tracking-normal font-normal mt-1 text-[0.78rem]">
            By <span className="text-gray-200 font-medium">Anton Svet</span> ·{' '}
            <span className="text-gray-200 font-medium">Santiago Rivadeneira</span> ·{' '}
            <span className="text-gray-200 font-medium">Arthur Margeat</span>
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl leading-[1.1]">
          Do Prediction Markets
          <br />
          Really Predict?
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Every 5 minutes, Polymarket opens a market: will Bitcoin go{' '}
          <span className="text-green-400 font-semibold">Up</span>{' '}
          or <span className="text-red-400 font-semibold">Down</span>?
          Token prices are supposed to reflect real probabilities.{' '}
          <span className="text-white font-bold">But do they?</span>
        </p>

        <div className="mt-8 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-elevated to-surface-elevated/40">
          {/* Subtle accent glow as decorative backdrop. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(circle, #c084fc 0%, transparent 70%)' }}
          />
          <div className="relative px-6 pt-5 pb-6">
            <p className="text-xs uppercase tracking-widest text-accent mb-4">
              Outcome split across all 9,181 markets
            </p>
            <HeroGauge
              upRate={stats?.up_rate ?? 0.5}
              nUp={stats?.n_up}
              nDown={stats?.n_down}
              animateMs={1100}
            />
          </div>
        </div>

        <div className="stat-grid mt-6 grid grid-cols-2 sm:grid-cols-4 rounded-2xl border border-border bg-surface-elevated overflow-hidden">
          <StatCard value={markets} label="Prediction markets" delay={0}   />
          <StatCard value={volumeM} label="Total volume (USD)" prefix="$" suffix="M" decimals={1} delay={200} />
          <StatCard value={days}    label="Days of data"       delay={400} />
          <DateRangeCard start={startDay} end={endDay} year={year} />
        </div>
      </div>

      <div className="pt-6 flex justify-center">
        <a href="#intro"
          className="group inline-flex flex-col items-center gap-1 text-xs text-muted hover:text-white transition-colors"
          aria-label="Scroll to the introduction">
          <span>Scroll down</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="animate-bounce" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </a>
      </div>
    </section>
  )
}
