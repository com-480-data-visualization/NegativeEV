/**
 * Vertical bar histogram of trades-per-market, with the average shown both
 * as a vertical reference line and in the legend.
 *
 * The Python pipeline emits unevenly sized buckets (1-100, 101-500, …),
 * so the X axis is treated as categorical; the avg line is positioned
 * proportionally inside its containing bucket.
 */
import { useEffect, useRef, useState } from 'react'

interface Bin            { label: string; count: number }
interface TradesData     { bins: Bin[]; summary: { avg: number; median: number; total_markets: number } }

interface Props {
  height?: number
}

// `PAD.top` reserves room for the avg-marker label so it sits above the
// tallest bar's percentage label instead of colliding with it.
const PAD    = { top: 32, bottom: 52, left: 56, right: 16 }
const ACCENT = '#c084fc'
const AVG    = '#facc15'

/** Lower bound of a bucket label like "501-1000" or "3000+". */
function bucketLower(label: string): number {
  if (label.endsWith('+')) return Number(label.slice(0, -1))
  return Number(label.split('-')[0])
}

/** Upper bound of a bucket label. Returns +∞ for the open-ended bucket. */
function bucketUpper(label: string): number {
  if (label.endsWith('+')) return Number.POSITIVE_INFINITY
  return Number(label.split('-')[1])
}

export default function TradesPerMarketChart({ height = 320 }: Props = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW]    = useState(700)
  const [data, setData] = useState<TradesData | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    fetch('/data/trades_per_market.json').then(r => r.json()).then(setData)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!data) {
    return (
      <div ref={containerRef} style={{ height }}
        className="flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    )
  }

  const bins = data.bins
  const { avg, median, total_markets } = data.summary

  const plotW = w - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const maxCount = Math.max(...bins.map(b => b.count), 1)
  const barW     = plotW / bins.length
  const toY      = (n: number) => PAD.top + plotH - (n / maxCount) * plotH

  // Position of avg line within the bucket that contains it.
  const avgIdx = bins.findIndex(b => avg >= bucketLower(b.label) && avg < bucketUpper(b.label))
  const avgX   = avgIdx >= 0
    ? (() => {
        const lo = bucketLower(bins[avgIdx].label)
        const hi = bucketUpper(bins[avgIdx].label)
        const frac = isFinite(hi) ? (avg - lo) / (hi - lo) : 0.5
        return PAD.left + avgIdx * barW + frac * barW
      })()
    : null

  const yMax  = maxCount
  const yTicks = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5),
                  Math.round(yMax * 0.75), yMax]

  return (
    <div ref={containerRef} className="w-full select-none">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: ACCENT }} />
          Markets ({total_markets.toLocaleString()})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0.5" style={{ background: AVG }} />
          Average: <span className="text-white font-medium">{avg.toLocaleString()}</span>
        </span>
        <span>Median: <span className="text-white font-medium">{median.toLocaleString()}</span></span>
      </div>

      <svg width={w} height={height} style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}>

        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD.left} y1={toY(v)} x2={PAD.left + plotW} y2={toY(v)}
              stroke="#1e293b" strokeWidth={1} />
            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize={10} fill="#64748b">
              {v.toLocaleString()}
            </text>
          </g>
        ))}

        {bins.map((b, i) => {
          const x      = PAD.left + i * barW
          const h      = (b.count / maxCount) * plotH
          const active = hover === i
          const pct    = (b.count / total_markets) * 100
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)}>
              <rect x={x + 4} y={PAD.top + plotH - h}
                width={Math.max(barW - 8, 1)} height={h}
                rx={2} fill={ACCENT}
                opacity={active ? 1 : 0.85} />
              {pct >= 1 && (
                <text x={x + barW / 2} y={PAD.top + plotH - h - 6}
                  textAnchor="middle" fontSize={10}
                  fill={active ? '#f1f5f9' : '#94a3b8'}>
                  {pct.toFixed(1)}%
                </text>
              )}
            </g>
          )
        })}

        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth={1} />

        {bins.map((b, i) => (
          <text key={b.label}
            x={PAD.left + i * barW + barW / 2}
            y={PAD.top + plotH + 16}
            textAnchor="middle" fontSize={10} fill="#94a3b8">
            {b.label}
          </text>
        ))}

        {avgX !== null && (
          <g>
            <line x1={avgX} y1={PAD.top} x2={avgX} y2={PAD.top + plotH}
              stroke={AVG} strokeWidth={1.5} strokeDasharray="4 3" />
            {/* Sits in the band reserved at the top of PAD; tallest bar's
                percentage label is now at `PAD.top - 6 = 26`, well below. */}
            <text x={avgX} y={12} textAnchor="middle"
              fontSize={10} fill={AVG} fontWeight={600}>
              avg {avg.toLocaleString()}
            </text>
          </g>
        )}

        <text x={PAD.left + plotW / 2} y={height - 4}
          textAnchor="middle" fontSize={11} fill="#94a3b8">
          Trades per five-minute market
        </text>
      </svg>
    </div>
  )
}
