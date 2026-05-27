import { useEffect, useRef, useState } from 'react'

interface Bin { lo: number; hi: number; up: number; down: number }
interface NormPoint { x: number; y: number }
interface DistData {
  bins: Bin[]
  normal_curve: NormPoint[]
  normal_fit: { mean: number; std: number }
  total_up: number; total_down: number; total: number
  clip_lo: number; clip_hi: number
}

const PAD = { top: 24, bottom: 44, left: 52, right: 20 }
const H = 300

const GREEN = '#22c55e'
const RED   = '#ef4444'
const CURVE = '#facc15'  // yellow normal-fit curve

export default function BtcDistributionChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(700)
  const [data, setData] = useState<DistData | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bin: Bin } | null>(null)

  useEffect(() => {
    fetch('/data/btc_distribution.json').then(r => r.json()).then(setData)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (!data) return <div ref={containerRef} style={{ height: H }} className="flex items-center justify-center text-muted text-sm">Loading…</div>

  const plotW = w - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const { bins, normal_curve, clip_lo, clip_hi, total_up, total_down, total } = data
  const range = clip_hi - clip_lo

  const maxCount = Math.max(...bins.map(b => b.up + b.down))
  const toX = (pct: number) => PAD.left + ((pct - clip_lo) / range) * plotW
  const toY = (cnt: number) => PAD.top + plotH - (cnt / maxCount) * plotH
  const binW = plotW / bins.length

  // Normal curve path
  const visibleCurve = normal_curve.filter(p => p.x >= clip_lo && p.x <= clip_hi)
  const curvePath = visibleCurve.length < 2 ? '' : visibleCurve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`)
    .join(' ')

  // X-axis tick values
  const xTicks = [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5]
  // Y-axis ticks
  const yTickVals = [0, Math.round(maxCount * 0.25), Math.round(maxCount * 0.5), Math.round(maxCount * 0.75), maxCount]

  return (
    <div ref={containerRef} className="w-full select-none">
      {/* Legend */}
      <div className="flex items-center gap-6 mb-3 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: GREEN }} />UP outcome ({total_up.toLocaleString()})</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: RED }} />DOWN outcome ({total_down.toLocaleString()})</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5" style={{ background: CURVE }} />Normal fit (μ={data.normal_fit.mean.toFixed(4)}%, σ={data.normal_fit.std.toFixed(4)}%)</span>
      </div>

      <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}>

        {/* Y grid */}
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(v)} x2={PAD.left + plotW} y2={toY(v)}
              stroke="#1e293b" strokeWidth={1} />
            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize={10} fill="#64748b">
              {v}
            </text>
          </g>
        ))}

        {/* Bins */}
        {bins.map((bin, i) => {
          const x = PAD.left + i * binW
          const totalH = (bin.up + bin.down) / maxCount * plotH
          const upH   = bin.up   / maxCount * plotH
          const downH = bin.down / maxCount * plotH
          const isHovered = tooltip?.bin === bin

          return (
            <g key={i}
              onMouseEnter={e => {
                const rect = (e.target as Element).closest('svg')!.getBoundingClientRect()
                setTooltip({ x: x + binW / 2, y: PAD.top + plotH - totalH, bin })
              }}>
              {/* DOWN bar (bottom) */}
              {downH > 0 && (
                <rect x={x + 0.5} y={PAD.top + plotH - downH} width={Math.max(binW - 1, 1)} height={downH}
                  fill={RED} opacity={isHovered ? 1 : 0.8} />
              )}
              {/* UP bar (on top of down) */}
              {upH > 0 && (
                <rect x={x + 0.5} y={PAD.top + plotH - downH - upH} width={Math.max(binW - 1, 1)} height={upH}
                  fill={GREEN} opacity={isHovered ? 1 : 0.8} />
              )}
            </g>
          )
        })}

        {/* Zero reference line */}
        <line x1={toX(0)} y1={PAD.top} x2={toX(0)} y2={PAD.top + plotH}
          stroke="#475569" strokeWidth={1.5} strokeDasharray="4 3" />

        {/* Normal fit curve */}
        {curvePath && (
          <path d={curvePath} fill="none" stroke={CURVE} strokeWidth={2}
            strokeLinejoin="round" opacity={0.85} />
        )}

        {/* X axis */}
        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth={1} />
        {xTicks.map(v => (
          <g key={v}>
            <line x1={toX(v)} y1={PAD.top + plotH} x2={toX(v)} y2={PAD.top + plotH + 4}
              stroke="#475569" strokeWidth={1} />
            <text x={toX(v)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={10} fill="#64748b">
              {v >= 0 ? '+' : ''}{v.toFixed(1)}%
            </text>
          </g>
        ))}

        {/* X axis label */}
        <text x={PAD.left + plotW / 2} y={H - 2} textAnchor="middle" fontSize={11} fill="#94a3b8">
          Final BTC price change (%)
        </text>

        {/* Tooltip */}
        {tooltip && (() => {
          const tx = Math.min(tooltip.x, PAD.left + plotW - 120)
          const ty = Math.max(tooltip.y - 10, PAD.top + 4)
          const b  = tooltip.bin
          return (
            <g>
              <rect x={tx - 4} y={ty - 14} width={134} height={62} rx={4}
                fill="#1e293b" stroke="#334155" strokeWidth={1} />
              <text x={tx} y={ty} fontSize={10} fill="#94a3b8">
                [{b.lo >= 0 ? '+' : ''}{b.lo.toFixed(3)}%, {b.hi >= 0 ? '+' : ''}{b.hi.toFixed(3)}%]
              </text>
              <text x={tx} y={ty + 16} fontSize={11} fill={GREEN}>▲ UP: {b.up}</text>
              <text x={tx} y={ty + 30} fontSize={11} fill={RED}>▼ DOWN: {b.down}</text>
              <text x={tx} y={ty + 44} fontSize={10} fill="#64748b">
                Total: {b.up + b.down} ({(((b.up + b.down) / total) * 100).toFixed(1)}%)
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
