/**
 * Daily USD volume time series (area + line).
 *
 * X axis is calendar dates (treated as a linear index); Y axis is volume in
 * millions of USD. On hover, a vertical guide and a tooltip surface the
 * exact value for the day under the cursor.
 */
import { useEffect, useRef, useState } from 'react'
import { smoothPath } from '../../lib/smooth'

interface Day        { date: string; volume_usd: number; n_markets: number }
interface DailyData  { days: Day[] }

interface Props {
  height?: number
}

const PAD    = { top: 18, bottom: 38, left: 56, right: 16 }
const ACCENT = '#c084fc'

function fmtDateShort(iso: string): string {
  // Avoid Date() timezone drift; ISO is YYYY-MM-DD, take month/day directly.
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, m, d] = iso.split('-')
  return `${months[Number(m) - 1]} ${Number(d)}`
}

export default function DailyVolumeChart({ height = 300 }: Props = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  const [w, setW]    = useState(700)
  const [data, setData] = useState<DailyData | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    fetch('/data/daily_volume.json').then(r => r.json()).then(setData)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!data || data.days.length === 0) {
    return (
      <div ref={containerRef} style={{ height }}
        className="flex items-center justify-center text-muted text-sm">
        Loading…
      </div>
    )
  }

  const days  = data.days
  const plotW = w - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const maxVol = Math.max(...days.map(d => d.volume_usd))
  const totVol = days.reduce((s, d) => s + d.volume_usd, 0)
  const stepX  = days.length > 1 ? plotW / (days.length - 1) : plotW

  const toX = (i: number) => PAD.left + i * stepX
  const toY = (v: number) => PAD.top + plotH - (v / maxVol) * plotH

  // Curve smoothing is shared with the calibration chart; see lib/smooth.ts.
  const pts      = days.map((d, i) => ({ x: toX(i), y: toY(d.volume_usd) }))
  const linePath = smoothPath(pts)
  const areaPath =
    `${linePath} L${toX(days.length - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} ` +
    `L${toX(0).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`

  const yMax  = Math.ceil(maxVol / 1_000_000 / 10) * 10
  const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax]
    .map(v => v * 1_000_000)

  const xTickEvery = Math.max(1, Math.ceil(days.length / 8))

  // Catmull-Rom smoothing can overshoot below the data on low-volume days,
  // visually pushing the spline under the y=0 baseline. We clip the area
  // and line to the plot rectangle so any negative excursion is hidden
  // without changing the curve geometry itself.
  const clipId = 'daily-volume-plot-clip'

  const onMove: React.MouseEventHandler<SVGSVGElement> = e => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const idx = Math.round((mx - PAD.left) / stepX)
    if (idx >= 0 && idx < days.length) setHoverIdx(idx)
    else setHoverIdx(null)
  }

  const hov = hoverIdx !== null ? days[hoverIdx] : null

  return (
    <div ref={containerRef} className="w-full select-none">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-3 text-xs text-muted">
        <span>Total volume: <span className="text-white font-medium">${(totVol / 1_000_000).toFixed(1)}M</span></span>
        <span>Days: <span className="text-white font-medium">{days.length}</span></span>
        <span>Avg/day: <span className="text-white font-medium">${(totVol / days.length / 1_000_000).toFixed(2)}M</span></span>
      </div>

      <svg ref={svgRef} width={w} height={height}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}>

        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD.left} y1={toY(v)} x2={PAD.left + plotW} y2={toY(v)}
              stroke="#1e293b" strokeWidth={1} />
            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize={10} fill="#64748b">
              ${(v / 1_000_000).toFixed(0)}M
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          <path d={areaPath} fill={ACCENT} opacity={0.18} />
          <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={1.8} />
        </g>

        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth={1} />

        {days.map((d, i) => i % xTickEvery === 0 && (
          <text key={d.date}
            x={toX(i)} y={PAD.top + plotH + 16}
            textAnchor="middle" fontSize={10} fill="#64748b">
            {fmtDateShort(d.date)}
          </text>
        ))}

        <text x={PAD.left + plotW / 2} y={height - 2}
          textAnchor="middle" fontSize={11} fill="#94a3b8">
          Date (UTC)
        </text>

        {hov && hoverIdx !== null && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={toX(hoverIdx)} y1={PAD.top} x2={toX(hoverIdx)} y2={PAD.top + plotH}
              stroke="#f1f5f9" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            <circle cx={toX(hoverIdx)} cy={toY(hov.volume_usd)} r={4}
              fill={ACCENT} stroke="#0f172a" strokeWidth={2} />
            {(() => {
              const tx = Math.min(Math.max(toX(hoverIdx) + 8, PAD.left + 8),
                                  PAD.left + plotW - 138)
              const ty = Math.max(toY(hov.volume_usd) - 42, PAD.top + 4)
              return (
                <g>
                  <rect x={tx} y={ty} width={134} height={56} rx={4}
                    fill="#1e293b" stroke="#334155" strokeWidth={1} />
                  <text x={tx + 6} y={ty + 16} fontSize={11} fill="#e2e8f0">
                    {fmtDateShort(hov.date)}
                  </text>
                  <text x={tx + 6} y={ty + 32} fontSize={11} fill={ACCENT}>
                    ${(hov.volume_usd / 1_000_000).toFixed(2)}M
                  </text>
                  <text x={tx + 6} y={ty + 48} fontSize={10} fill="#94a3b8">
                    {hov.n_markets.toLocaleString()} markets
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
