/**
 * Day-of-week × hour-of-day heatmap.
 *
 * Mode is supplied by the parent so two charts can render stacked or
 * side-by-side (one for the UP rate, one for the market count). Tooltip and
 * legend adapt to the active mode.
 *
 * Sizing is responsive: a ResizeObserver measures the container width and
 * each of the 24 columns gets `(available - paddings) / 24` pixels, so the
 * grid always fits without horizontal scrolling. Cell height tracks cell
 * width through a fixed aspect ratio, capped so the grid does not become
 * absurdly tall on very wide containers.
 */
import { useEffect, useRef, useState } from 'react'

interface Cell {
  dow:     number
  hour:    number
  count:   number
  up_rate: number | null
  volume?: number    // USD, optional for backwards-compat with older payloads
}
interface HeatmapData { cells: Cell[]; days: string[]; hours: number[] }

export type HeatmapMode = 'up_rate' | 'count' | 'volume'

interface Props {
  mode: HeatmapMode
}

const PAD_LEFT  = 44
const PAD_TOP   = 32
const PAD_RIGHT = 8
const PAD_BOT   = 8
const ASPECT    = 18 / 28     // original CELL_H / CELL_W ratio
const MAX_H     = 26          // cap cell height on very wide containers

// Diverging green-gray-red for UP rate (0 = red, 0.5 = gray, 1 = green).
function upRateColor(rate: number): string {
  if (rate >= 0.5) {
    const t = (rate - 0.5) / 0.5
    const g = Math.round(100 + t * (197 - 100))
    return `rgb(34,${g},78)`
  }
  const t = (0.5 - rate) / 0.5
  const r = Math.round(100 + t * (239 - 100))
  return `rgb(${r},68,68)`
}

// Sequential blue for the count view.
function countColor(count: number, max: number): string {
  const t = max > 0 ? count / max : 0
  const b = Math.round(80 + t * 175)
  const g = Math.round(10 + t *  80)
  return `rgb(30,${g},${b})`
}

// 5-stop viridis-inspired palette (perceptually uniform, high contrast).
// Dark purple → blue → teal → green → yellow.
const VIRIDIS: ReadonlyArray<readonly [number, number, number]> = [
  [ 68,   1,  84],
  [ 59,  82, 139],
  [ 33, 145, 140],
  [ 94, 201,  98],
  [253, 231,  37],
]

/** Interpolate the viridis palette at t ∈ [0, 1]. */
function viridis(t: number): string {
  const c = Math.max(0, Math.min(1, t))
  const idx = c * (VIRIDIS.length - 1)
  const lo  = Math.floor(idx)
  const hi  = Math.min(lo + 1, VIRIDIS.length - 1)
  const f   = idx - lo
  const [r0, g0, b0] = VIRIDIS[lo]
  const [r1, g1, b1] = VIRIDIS[hi]
  return `rgb(${Math.round(r0 + (r1 - r0) * f)},${Math.round(g0 + (g1 - g0) * f)},${Math.round(b0 + (b1 - b0) * f)})`
}

/** Volume colour: spread the active range across the full palette so every
 *  legend colour shows up on the grid. We min/max normalise (so the smallest
 *  active cell hits the deep purple end and the largest hits yellow), then
 *  apply a mild sqrt boost to give mid-range buckets more breathing room. */
function volumeColor(vol: number, min: number, max: number): string {
  if (max <= min) return viridis(0)
  const t = (vol - min) / (max - min)
  return viridis(Math.sqrt(Math.max(0, Math.min(1, t))))
}

// Compact USD format used by both legend and tooltip.
function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export default function HeatmapChart({ mode }: Props) {
  const containerRef          = useRef<HTMLDivElement>(null)
  const [w, setW]             = useState(700)
  const [data,    setData]    = useState<HeatmapData | null>(null)
  const [tooltip, setTooltip] = useState<{ cell: Cell } | null>(null)

  useEffect(() => {
    fetch('/data/hourly_heatmap.json').then(r => r.json()).then(setData)
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
      <div ref={containerRef}
        className="flex items-center justify-center h-48 text-muted text-sm">
        Loading…
      </div>
    )
  }

  const { cells, days } = data
  const maxCount  = Math.max(...cells.map(c => c.count))
  // Min/max are computed over active cells only (the dark zero cells would
  // otherwise pin the lower bound at 0 and waste half the palette).
  const activeVols = cells.filter(c => c.count > 0).map(c => c.volume ?? 0)
  const maxVolume  = activeVols.length ? Math.max(...activeVols) : 0
  const minVolume  = activeVols.length ? Math.min(...activeVols) : 0

  // Fit 24 columns inside the available width, no scrolling.
  const cellW = Math.max((w - PAD_LEFT - PAD_RIGHT) / 24, 1)
  const cellH = Math.min(cellW * ASPECT, MAX_H)
  const svgW  = PAD_LEFT + 24 * cellW + PAD_RIGHT
  const svgH  = PAD_TOP  +  7 * cellH + PAD_BOT

  return (
    <div ref={containerRef} className="w-full select-none">
      <div className="relative">
        <svg width={svgW} height={svgH} style={{ display: 'block' }}
          onMouseLeave={() => setTooltip(null)}>

          {/* Hour labels every 3h */}
          {Array.from({ length: 24 }, (_, h) => h % 3 === 0 && (
            <text key={h}
              x={PAD_LEFT + h * cellW + cellW / 2}
              y={PAD_TOP - 6}
              textAnchor="middle" fontSize={9} fill="#64748b">
              {String(h).padStart(2, '0')}h
            </text>
          ))}

          {days.map((d, dow) => (
            <text key={dow}
              x={PAD_LEFT - 6}
              y={PAD_TOP + dow * cellH + cellH / 2 + 4}
              textAnchor="end" fontSize={10} fill="#94a3b8">
              {d}
            </text>
          ))}

          {cells.map(cell => {
            if (cell.count === 0) return null
            const cx = PAD_LEFT + cell.hour * cellW
            const cy = PAD_TOP  + cell.dow  * cellH
            let fill: string
            if (mode === 'up_rate') {
              fill = cell.up_rate !== null ? upRateColor(cell.up_rate) : '#1e293b'
            } else if (mode === 'volume') {
              fill = volumeColor(cell.volume ?? 0, minVolume, maxVolume)
            } else {
              fill = countColor(cell.count, maxCount)
            }
            const isHover = tooltip?.cell === cell

            return (
              <rect key={`${cell.dow}:${cell.hour}`}
                x={cx + 1} y={cy + 1}
                width={Math.max(cellW - 2, 1)} height={Math.max(cellH - 2, 1)}
                rx={2} fill={fill}
                stroke={isHover ? '#e2e8f0' : 'none'} strokeWidth={1.5}
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setTooltip({ cell })}
              />
            )
          })}
        </svg>

        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          {mode === 'up_rate' && (
            <>
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: upRateColor(0.05) }} />
              <span>Low UP rate</span>
              <div className="flex h-3 w-24 rounded overflow-hidden">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="flex-1" style={{ background: upRateColor(i / 11) }} />
                ))}
              </div>
              <span>High UP rate</span>
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: upRateColor(0.95) }} />
            </>
          )}
          {mode === 'count' && (
            <>
              <span>Few markets</span>
              <div className="flex h-3 w-24 rounded overflow-hidden">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="flex-1" style={{ background: countColor(i + 1, 12) }} />
                ))}
              </div>
              <span>Many markets</span>
            </>
          )}
          {mode === 'volume' && (
            <>
              <span>{minVolume > 0 ? `${fmtUsd(minVolume)}` : 'Low'}</span>
              <div className="flex h-3 w-32 rounded overflow-hidden">
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="flex-1" style={{ background: viridis(i / 23) }} />
                ))}
              </div>
              <span>{maxVolume > 0 ? `${fmtUsd(maxVolume)} traded` : 'High'}</span>
            </>
          )}
        </div>
      </div>

      {/* Tooltip slot - always present with fixed height so hovering doesn't
          resize the parent card. Falls back to a hint when nothing is hovered. */}
      <div className="mt-2 h-9 flex items-center">
        {tooltip ? (() => {
          const c = tooltip.cell
          return (
            <div className="text-xs text-muted bg-surface border border-border rounded-lg px-3 py-2 inline-block">
              <span className="font-medium text-white">{days[c.dow]} {String(c.hour).padStart(2,'0')}:00 UTC</span>
              {' · '}
              <span className="text-white">{c.count} markets</span>
              {c.volume !== undefined && c.volume > 0 && (
                <>
                  {' · '}
                  <span className="text-accent">{fmtUsd(c.volume)} traded</span>
                </>
              )}
              {c.up_rate !== null && (
                <>
                  {' · '}
                  <span style={{ color: upRateColor(c.up_rate) }}>
                    {(c.up_rate * 100).toFixed(1)}% UP rate
                  </span>
                </>
              )}
            </div>
          )
        })() : (
          <span className="text-xs text-muted/60 italic">Hover a cell for details</span>
        )}
      </div>
    </div>
  )
}
