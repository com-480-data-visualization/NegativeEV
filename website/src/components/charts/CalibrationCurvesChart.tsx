/**
 * Multi-line calibration chart: market price vs realised UP rate, at four
 * snapshots before market close. A diagonal y = x is overlaid as the
 * "perfectly calibrated" baseline; each line collapses onto it as the market
 * approaches close.
 *
 * Same building blocks as the rest of the site: SVG with a ResizeObserver,
 * smoothed paths via lib/smooth, fixed-height tooltip slot to avoid layout
 * shift. The plot stays square so the diagonal is a visual 45°.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { smoothPath } from '../../lib/smooth'

interface CalPoint      { p: number; up: number; n: number }
interface CalCheckpoint { second: number; label: string; mse: number; n_markets: number; points: CalPoint[] }
interface CalData       { checkpoints: CalCheckpoint[] }

interface Props { maxSize?: number }

const PAD     = { top: 16, right: 16, bottom: 38, left: 44 }
const MIN_W   = 280
const DIAGONAL = '#475569'

// Visually distinct, theme-consistent palette. Ordered so the "open" line is
// the warmest (accent purple) and the "close" line is the coolest (emerald).
const COLORS = ['#c084fc', '#f97316', '#fbbf24', '#34d399'] as const

const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`

export default function CalibrationCurvesChart({ maxSize = 520 }: Props = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  const [side,  setSide]  = useState(MIN_W)
  const [data,  setData]  = useState<CalData | null>(null)
  // Hide the noisiest curve (sec=0, "5 min remaining") by default - its many
  // ties at the opening price produce a jagged line that hides the cleaner
  // shrink-to-diagonal story told by the later snapshots.
  const [hidden, setHidden] = useState<Set<number>>(new Set([0]))
  const [hover, setHover] = useState<{ ci: number; pi: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/calibration_curves.json')
      .then(r => r.json() as Promise<CalData>)
      .then(d => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(e => {
      const w = e[0].contentRect.width
      setSide(Math.max(MIN_W, Math.min(w, maxSize)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxSize])

  // Project once; memoised so hover re-renders don't rebuild the geometry.
  const projected = useMemo(() => {
    if (!data) return null
    const plotW = side - PAD.left - PAD.right
    const plotH = side - PAD.top  - PAD.bottom
    const toX = (p: number) => PAD.left + p * plotW
    const toY = (u: number) => PAD.top + plotH - u * plotH
    const series = data.checkpoints.map((c, ci) => ({
      ci,
      checkpoint: c,
      color: COLORS[ci % COLORS.length],
      pts: c.points.map(pt => ({ x: toX(pt.p), y: toY(pt.up) })),
    }))
    return { plotW, plotH, toX, toY, series }
  }, [data, side])

  if (!data || !projected) {
    return (
      <div ref={containerRef} style={{ height: side }}
        className="flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    )
  }

  const { plotW, plotH, toX, toY, series } = projected
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const toggle = (ci: number) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(ci) ? next.delete(ci) : next.add(ci)
      return next
    })
  }

  // Hover: find the nearest visible point across all visible series.
  const onMove: React.MouseEventHandler<SVGSVGElement> = e => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let best: { ci: number; pi: number; d2: number } | null = null
    for (const s of series) {
      if (hidden.has(s.ci)) continue
      s.pts.forEach((pt, pi) => {
        const dx = pt.x - mx
        const dy = pt.y - my
        const d2 = dx * dx + dy * dy
        if (!best || d2 < best.d2) best = { ci: s.ci, pi, d2 }
      })
    }
    if (best && best.d2 < 40 * 40) setHover({ ci: best.ci, pi: best.pi })
    else setHover(null)
  }

  const hov = hover
    ? { s: series[hover.ci], p: data.checkpoints[hover.ci].points[hover.pi] }
    : null

  return (
    <div ref={containerRef} className="w-full select-none">
      {/* Legend - clickable chips matching the site's existing legend style.
          Reversed so the "Just before close" chip leads: that's the order in
          which the curves stack at the right edge of the plot, and it reads
          naturally from "best-calibrated → worst-calibrated". */}
      <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
        {[...series].reverse().map(s => {
          const active = !hidden.has(s.ci)
          return (
            <button
              key={s.ci}
              type="button"
              onClick={() => toggle(s.ci)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all ${
                active
                  ? 'border-border bg-surface text-gray-200 hover:border-accent'
                  : 'border-border/40 bg-transparent text-muted opacity-50 hover:opacity-80'
              }`}
            >
              <span className="inline-block w-[14px] h-[2px]" style={{ background: s.color }} />
              {s.checkpoint.label}
              <span className="text-muted">· MSE {s.checkpoint.mse.toFixed(4)}</span>
            </button>
          )
        })}
      </div>

      {/* Centered square plot - the y = x diagonal must render at 45°. */}
      <div className="flex justify-center">
        <svg ref={svgRef} width={side} height={side}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}>

          {/* Gridlines + axis ticks */}
          {ticks.map(t => (
            <g key={`gy-${t}`}>
              <line x1={PAD.left} y1={toY(t)} x2={PAD.left + plotW} y2={toY(t)}
                stroke="#1e293b" strokeWidth={1} />
              <text x={PAD.left - 6} y={toY(t) + 4} textAnchor="end" fontSize={10} fill="#64748b">
                {fmtPct(t)}
              </text>
            </g>
          ))}
          {ticks.map(t => (
            <g key={`gx-${t}`}>
              <line x1={toX(t)} y1={PAD.top} x2={toX(t)} y2={PAD.top + plotH}
                stroke="#1e293b" strokeWidth={1} />
              <text x={toX(t)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={10} fill="#64748b">
                {fmtPct(t)}
              </text>
            </g>
          ))}

          {/* Perfect-calibration baseline. */}
          <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)}
            stroke={DIAGONAL} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.7} />
          <text x={toX(0.92)} y={toY(0.96)}
            textAnchor="end" fontSize={10} fill="#94a3b8" fontStyle="italic">
            Perfect calibration
          </text>

          {/* Plot border. */}
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH}
            fill="none" stroke="#334155" strokeWidth={1} />

          {/* One smoothed line per visible checkpoint. */}
          {series.map(s => hidden.has(s.ci) ? null : (
            <path key={s.ci} d={smoothPath(s.pts)}
              fill="none" stroke={s.color} strokeWidth={1.8}
              strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* Axis labels. */}
          <text x={PAD.left + plotW / 2} y={side - 2}
            textAnchor="middle" fontSize={11} fill="#94a3b8">
            Market price (implied UP probability)
          </text>
          <text x={12} y={PAD.top + plotH / 2}
            textAnchor="middle" fontSize={11} fill="#94a3b8"
            transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}>
            Observed UP rate
          </text>

          {/* Hover marker - both crosshair guides keep the eye anchored. */}
          {hov && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={toX(hov.p.p)} y1={PAD.top} x2={toX(hov.p.p)} y2={PAD.top + plotH}
                stroke="#f1f5f9" strokeDasharray="3 3" opacity={0.35} />
              <line x1={PAD.left} y1={toY(hov.p.up)} x2={PAD.left + plotW} y2={toY(hov.p.up)}
                stroke="#f1f5f9" strokeDasharray="3 3" opacity={0.35} />
              <circle cx={toX(hov.p.p)} cy={toY(hov.p.up)} r={4}
                fill={hov.s.color} stroke="#0f172a" strokeWidth={2} />
            </g>
          )}
        </svg>
      </div>

      {/* Tooltip slot - always present (fixed height) to avoid layout shift. */}
      <div className="mt-2 h-9 flex items-center justify-center">
        {hov ? (
          <div className="text-xs text-muted bg-surface border border-border rounded-lg px-3 py-2 inline-block">
            <span className="font-medium text-white">{hov.s.checkpoint.label}</span>
            {' · '}
            <span style={{ color: hov.s.color }}>implied {(hov.p.p * 100).toFixed(1)}%</span>
            {' · '}
            <span className="text-white">observed {(hov.p.up * 100).toFixed(1)}%</span>
            {' · '}
            <span className="text-muted">{hov.p.n.toLocaleString()} markets in bucket</span>
          </div>
        ) : (
          <span className="text-xs text-muted/60 italic">
            Hover for bucket details · click a legend chip to hide a curve
          </span>
        )}
      </div>
    </div>
  )
}
