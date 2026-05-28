/**
 * XY scatter: BTC return per market (X, linear, %) vs market volume (Y, log, USD).
 *
 * Points are coloured by outcome sign (green = UP, red = DOWN). On mousemove
 * we find the nearest point and surface a small tooltip; the search is
 * `O(n)` but `n` is capped at SCATTER_MAX (3000) by the Python pipeline,
 * so we trade simplicity over more involved indexing structures.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

interface ScatterPoint { v: number; p: number }
interface ScatterData { points: ScatterPoint[]; total: number }

interface Props {
  height?: number
}

const PAD   = { top: 18, bottom: 40, left: 56, right: 16 }
const GREEN = '#22c55e'
const RED   = '#ef4444'

/** Pretty-print a USD volume value compactly. */
function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export default function VolumeVsChangeScatter({ height = 340 }: Props = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  const [w, setW]    = useState(700)
  const [data, setData] = useState<ScatterData | null>(null)
  const [hover, setHover] = useState<ScatterPoint | null>(null)

  useEffect(() => {
    fetch('/data/volume_vs_change.json').then(r => r.json()).then(setData)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scales = useMemo(() => {
    if (!data) return null
    const pts = data.points
    if (pts.length === 0) return null

    const ps = pts.map(p => p.p)
    const vs = pts.map(p => Math.max(p.v, 1))  // clamp for log
    const xMin = Math.min(...ps)
    const xMax = Math.max(...ps)
    // Symmetric X bounds for readability, padded by 10%.
    const xAbs = Math.max(Math.abs(xMin), Math.abs(xMax)) * 1.1 || 1
    const yLogMin = Math.log10(Math.min(...vs))
    const yLogMax = Math.log10(Math.max(...vs))

    return { xAbs, yLogMin: Math.floor(yLogMin), yLogMax: Math.ceil(yLogMax) }
  }, [data])

  if (!data || !scales) {
    return (
      <div ref={containerRef} style={{ height }}
        className="flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    )
  }

  const plotW = w - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const { xAbs, yLogMin, yLogMax } = scales
  const yLogSpan = Math.max(yLogMax - yLogMin, 0.1)

  const toX = (p: number) => PAD.left + ((p + xAbs) / (2 * xAbs)) * plotW
  const toY = (v: number) => {
    const t = (Math.log10(Math.max(v, 1)) - yLogMin) / yLogSpan
    return PAD.top + plotH - t * plotH
  }

  const xTicks: number[] = []
  // Choose tick step so we end up with ~5–9 ticks on each side.
  const step = xAbs <= 1 ? 0.25 : xAbs <= 2 ? 0.5 : 1
  for (let v = -Math.floor(xAbs / step) * step; v <= xAbs + 1e-9; v += step) {
    xTicks.push(Number(v.toFixed(4)))
  }
  const yTicks: number[] = []
  for (let e = yLogMin; e <= yLogMax; e++) yTicks.push(10 ** e)

  const findNearest = (mx: number, my: number): ScatterPoint | null => {
    let best: ScatterPoint | null = null
    let bestD = Infinity
    for (const pt of data.points) {
      const dx = toX(pt.p) - mx
      const dy = toY(pt.v) - my
      const d  = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = pt }
    }
    return bestD < 24 * 24 ? best : null
  }

  const onMove: React.MouseEventHandler<SVGSVGElement> = e => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover(findNearest(e.clientX - rect.left, e.clientY - rect.top))
  }

  return (
    <div ref={containerRef} className="w-full select-none">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: GREEN }} />
          UP outcome
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: RED }} />
          DOWN outcome
        </span>
        <span>{data.total.toLocaleString()} markets shown (subsampled)</span>
      </div>

      <svg ref={svgRef} width={w} height={height}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}>

        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD.left} y1={toY(v)} x2={PAD.left + plotW} y2={toY(v)}
              stroke="#1e293b" strokeWidth={1} />
            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize={10} fill="#64748b">
              {fmtUsd(v)}
            </text>
          </g>
        ))}

        <line x1={toX(0)} y1={PAD.top} x2={toX(0)} y2={PAD.top + plotH}
          stroke="#475569" strokeWidth={1} strokeDasharray="4 3" />

        {data.points.map((pt, i) => (
          <circle key={i} cx={toX(pt.p)} cy={toY(pt.v)} r={2}
            fill={pt.p >= 0 ? GREEN : RED} opacity={0.45} />
        ))}

        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth={1} />
        {xTicks.map(v => (
          <g key={v}>
            <line x1={toX(v)} y1={PAD.top + plotH} x2={toX(v)} y2={PAD.top + plotH + 4}
              stroke="#475569" strokeWidth={1} />
            <text x={toX(v)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={10} fill="#64748b">
              {v > 0 ? '+' : ''}{v.toFixed(v % 1 === 0 ? 0 : 2)}%
            </text>
          </g>
        ))}

        <text x={PAD.left + plotW / 2} y={height - 2}
          textAnchor="middle" fontSize={11} fill="#94a3b8">
          BTC price change at resolution (%)
        </text>

        {hover && (
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={toX(hover.p)} cy={toY(hover.v)} r={5}
              fill="none" stroke="#f1f5f9" strokeWidth={1.5} />
            {(() => {
              const tx = Math.min(Math.max(toX(hover.p) + 8, PAD.left + 8),
                                  PAD.left + plotW - 112)
              const ty = Math.max(toY(hover.v) - 38, PAD.top + 4)
              return (
                <g>
                  <rect x={tx} y={ty} width={108} height={42} rx={4}
                    fill="#1e293b" stroke="#334155" strokeWidth={1} />
                  <text x={tx + 6} y={ty + 16} fontSize={11} fill="#e2e8f0">
                    {hover.p > 0 ? '+' : ''}{hover.p.toFixed(3)}%
                  </text>
                  <text x={tx + 6} y={ty + 32} fontSize={11}
                    fill={hover.p >= 0 ? GREEN : RED}>
                    {fmtUsd(hover.v)} volume
                  </text>
                </g>
              )
            })()}
          </g>
        )}
      </svg>
    </div>
  )
}
