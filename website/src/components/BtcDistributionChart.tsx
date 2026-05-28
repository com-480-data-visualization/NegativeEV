/**
 * Stacked UP / DOWN histogram of final BTC price changes, overlaid with a
 * normal-distribution fit.
 *
 * Two distinct windows are exposed by the same data file: a narrow window
 * (the bulk of the distribution, default) and a wide window (fat-tails view).
 * The `binsKey` prop selects between them. `xRange` and `xTickStep` are
 * optional overrides; when omitted they are derived from the bins themselves.
 *
 * Design note: sub-components (legend swatches, tooltip group) are inlined
 * intentionally - none are reused elsewhere and they share the parent's
 * scales without prop drilling.
 */
import { useEffect, useRef, useState } from 'react'

interface Bin       { lo: number; hi: number; up: number; down: number }
interface NormPoint { x: number; y: number }

export interface DistData {
  bins:               Bin[]
  normal_curve:       NormPoint[]
  normal_fit:         { mean: number; std: number }
  clip_lo:            number
  clip_hi:            number
  wide_bins?:         Bin[]
  wide_normal_curve?: NormPoint[]
  wide_normal_fit?:   { mean: number; std: number }
  wide_clip_lo?:      number
  wide_clip_hi?:      number
  total_up:           number
  total_down:         number
  total:              number
}

export type BinsKey = 'bins' | 'wide_bins'

interface Props {
  /** Which range to display. Defaults to the narrow view to preserve old call sites. */
  binsKey?:   BinsKey
  /** Optional override for the visible X range, in percent. */
  xRange?:    [number, number]
  /** Optional override for the X-axis tick step (in percent). */
  xTickStep?: number
}

const PAD   = { top: 24, bottom: 44, left: 52, right: 20 }
const H     = 300
const GREEN = '#22c55e'
const RED   = '#ef4444'
const CURVE = '#facc15'

/** Build evenly-spaced ticks across [lo, hi] using a sensible step. */
function buildTicks(lo: number, hi: number, step: number): number[] {
  const out: number[] = []
  const start = Math.ceil(lo / step) * step
  for (let v = start; v <= hi + 1e-9; v += step) {
    out.push(Number(v.toFixed(6)))
  }
  return out
}

/** Pick a default tick step that yields ~11 ticks across the range. */
function defaultTickStep(span: number): number {
  if (span <= 0.6)  return 0.1
  if (span <= 1.5)  return 0.25
  if (span <= 3.5)  return 0.5
  return 1.0
}

/** Format a tick value, hiding trailing zeros while preserving the sign. */
function fmtTick(v: number): string {
  const sign = v > 0 ? '+' : ''
  const abs  = Math.abs(v)
  const dec  = abs < 1 ? 2 : 1
  return `${sign}${v.toFixed(dec).replace(/\.?0+$/, '')}%`
}

export default function BtcDistributionChart({
  binsKey   = 'bins',
  xRange,
  xTickStep,
}: Props = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW]     = useState(700)
  const [data, setData]       = useState<DistData | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bin: Bin } | null>(null)

  useEffect(() => {
    fetch('/data/btc_distribution.json').then(r => r.json()).then(setData)
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
      <div ref={containerRef} style={{ height: H }}
        className="flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    )
  }

  // Resolve which view we're rendering. Falls back to narrow if wide is missing.
  const useWide = binsKey === 'wide_bins' && Boolean(data.wide_bins)
  const bins         = useWide ? data.wide_bins!         : data.bins
  const normalCurve  = useWide ? data.wide_normal_curve! : data.normal_curve
  const normalFit    = useWide ? data.wide_normal_fit!   : data.normal_fit
  const clipLo       = useWide ? data.wide_clip_lo!      : data.clip_lo
  const clipHi       = useWide ? data.wide_clip_hi!      : data.clip_hi

  const [xMin, xMax] = xRange ?? [clipLo, clipHi]
  const span         = xMax - xMin
  const tickStep     = xTickStep ?? defaultTickStep(span)
  const xTicks       = buildTicks(xMin, xMax, tickStep)

  const plotW = w - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const maxCount = Math.max(...bins.map(b => b.up + b.down), 1)
  const toX      = (pct: number) => PAD.left + ((pct - xMin) / span) * plotW
  const toY      = (cnt: number) => PAD.top + plotH - (cnt / maxCount) * plotH
  const binW     = plotW / bins.length

  const visibleCurve = normalCurve.filter(p => p.x >= xMin && p.x <= xMax)
  const curvePath = visibleCurve.length < 2 ? '' : visibleCurve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`)
    .join(' ')

  const yTickVals = [
    0,
    Math.round(maxCount * 0.25),
    Math.round(maxCount * 0.5),
    Math.round(maxCount * 0.75),
    maxCount,
  ]

  return (
    <div ref={containerRef} className="w-full select-none">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: GREEN }} />
          UP outcome ({data.total_up.toLocaleString()})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: RED }} />
          DOWN outcome ({data.total_down.toLocaleString()})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0.5" style={{ background: CURVE }} />
          Normal fit (μ={normalFit.mean.toFixed(4)}%, σ={normalFit.std.toFixed(4)}%)
        </span>
      </div>

      <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}>

        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(v)} x2={PAD.left + plotW} y2={toY(v)}
              stroke="#1e293b" strokeWidth={1} />
            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize={10} fill="#64748b">
              {v}
            </text>
          </g>
        ))}

        {bins.map((bin, i) => {
          const x      = PAD.left + i * binW
          const totalH = (bin.up + bin.down) / maxCount * plotH
          const upH    = bin.up   / maxCount * plotH
          const downH  = bin.down / maxCount * plotH
          const hover  = tooltip?.bin === bin

          return (
            <g key={i}
              onMouseEnter={() => setTooltip({
                x: x + binW / 2,
                y: PAD.top + plotH - totalH,
                bin,
              })}>
              {downH > 0 && (
                <rect x={x + 0.5} y={PAD.top + plotH - downH}
                  width={Math.max(binW - 1, 1)} height={downH}
                  fill={RED} opacity={hover ? 1 : 0.8} />
              )}
              {upH > 0 && (
                <rect x={x + 0.5} y={PAD.top + plotH - downH - upH}
                  width={Math.max(binW - 1, 1)} height={upH}
                  fill={GREEN} opacity={hover ? 1 : 0.8} />
              )}
            </g>
          )
        })}

        {/* Zero reference */}
        {xMin <= 0 && xMax >= 0 && (
          <line x1={toX(0)} y1={PAD.top} x2={toX(0)} y2={PAD.top + plotH}
            stroke="#475569" strokeWidth={1.5} strokeDasharray="4 3" />
        )}

        {curvePath && (
          <path d={curvePath} fill="none" stroke={CURVE} strokeWidth={2}
            strokeLinejoin="round" opacity={0.85} />
        )}

        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth={1} />
        {xTicks.map(v => (
          <g key={v}>
            <line x1={toX(v)} y1={PAD.top + plotH} x2={toX(v)} y2={PAD.top + plotH + 4}
              stroke="#475569" strokeWidth={1} />
            <text x={toX(v)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={10} fill="#64748b">
              {fmtTick(v)}
            </text>
          </g>
        ))}

        <text x={PAD.left + plotW / 2} y={H - 2} textAnchor="middle" fontSize={11} fill="#94a3b8">
          Final BTC price change (%)
        </text>

        {tooltip && (() => {
          const tx = Math.min(tooltip.x, PAD.left + plotW - 120)
          const ty = Math.max(tooltip.y - 10, PAD.top + 4)
          const b  = tooltip.bin
          return (
            <g>
              <rect x={tx - 4} y={ty - 14} width={134} height={62} rx={4}
                fill="#1e293b" stroke="#334155" strokeWidth={1} />
              <text x={tx} y={ty} fontSize={10} fill="#94a3b8">
                [{fmtTick(b.lo)}, {fmtTick(b.hi)}]
              </text>
              <text x={tx} y={ty + 16} fontSize={11} fill={GREEN}>▲ UP: {b.up}</text>
              <text x={tx} y={ty + 30} fontSize={11} fill={RED}>▼ DOWN: {b.down}</text>
              <text x={tx} y={ty + 44} fontSize={10} fill="#64748b">
                Total: {b.up + b.down} ({(((b.up + b.down) / data.total) * 100).toFixed(1)}%)
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
