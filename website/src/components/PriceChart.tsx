import { useEffect, useRef, useState } from 'react'

interface SecondData {
  second: number
  btc_pct_change: number  // already in % (e.g. 0.051 = +0.051%)
  btc_price: number
}

interface Props {
  seconds: SecondData[]   // full 300-second array (stable Y scale)
  currentSecond: number   // 0-299
}

const PAD = { top: 18, bottom: 28, left: 60, right: 100 }

export default function PriceChart({ seconds, currentSecond }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(700)
  const H = 220

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (seconds.length === 0) return <div ref={containerRef} style={{ height: H }} />

  const plotW = w - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const visible = seconds.slice(0, currentSecond + 1)

  // Y scale: dynamic — only uses data revealed so far (0..currentSecond).
  // Symmetric around 0 so the scale doesn't hint at future price direction.
  // Only ever expands, never contracts (avoids axis jumping backwards).
  const visY   = visible.map(s => s.btc_pct_change)
  const maxAbs = Math.max(0.005, ...visY.map(Math.abs))
  const pad    = Math.max(maxAbs * 0.25, 0.003)
  const yMin   = -(maxAbs + pad)
  const yMax   =  (maxAbs + pad)
  const yRange = yMax - yMin

  const toX = (s: number) => PAD.left + (s / 299) * plotW
  const toY = (v: number) => PAD.top + plotH - ((v - yMin) / yRange) * plotH
  const y0  = toY(0)

  const lastPct  = visible[visible.length - 1]?.btc_pct_change ?? 0
  const lastPrice = visible[visible.length - 1]?.btc_price ?? 0
  const initPrice = seconds[0]?.btc_price ?? 0
  const absDiff   = lastPrice - initPrice
  const isPos     = lastPct >= 0
  const green = '#22c55e'
  const red   = '#ef4444'
  const color = isPos ? green : red

  // Build SVG path
  const linePath = visible.length < 2 ? '' : visible
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(d.second).toFixed(1)},${toY(d.btc_pct_change).toFixed(1)}`)
    .join(' ')

  const fillPath = linePath
    ? `${linePath} L${toX(visible[visible.length - 1].second).toFixed(1)},${y0.toFixed(1)} L${toX(0).toFixed(1)},${y0.toFixed(1)} Z`
    : ''

  // Y axis ticks — values are already in %
  const nTicks = 5
  const yTicks: number[] = Array.from({ length: nTicks + 1 }, (_, i) => yMin + (yRange / nTicks) * i)

  // X axis labels
  const xTicks = [0, 60, 120, 180, 240, 299]

  return (
    <div ref={containerRef} className="w-full select-none">
      <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }}>

        {/* Subtle grid */}
        {yTicks.map((v, i) => (
          <line key={i}
            x1={PAD.left} y1={toY(v)} x2={PAD.left + plotW} y2={toY(v)}
            stroke="#1e293b" strokeWidth={1}
          />
        ))}

        {/* Zero reference */}
        <line x1={PAD.left} y1={y0} x2={PAD.left + plotW} y2={y0}
          stroke="#475569" strokeWidth={1} strokeDasharray="5 3" />

        {/* Fill */}
        {fillPath && (
          <path d={fillPath} fill={isPos ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'} />
        )}

        {/* Line */}
        {linePath && (
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        )}

        {/* Current dot */}
        {visible.length > 0 && (
          <circle
            cx={toX(visible[visible.length - 1].second)}
            cy={toY(lastPct)}
            r={4} fill={color}
          />
        )}

        {/* Y axis labels — btc_pct_change is already in %, show directly */}
        {yTicks.map((v, i) => (
          <text key={i}
            x={PAD.left - 6} y={toY(v) + 4}
            textAnchor="end" fontSize={10} fill="#64748b"
          >
            {v >= 0 ? '+' : ''}{v.toFixed(3)}%
          </text>
        ))}

        {/* X axis */}
        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth={1} />
        {xTicks.map(s => (
          <g key={s}>
            <line x1={toX(s)} y1={PAD.top + plotH} x2={toX(s)} y2={PAD.top + plotH + 4}
              stroke="#475569" strokeWidth={1} />
            <text x={toX(s)} y={PAD.top + plotH + 15}
              textAnchor="middle" fontSize={10} fill="#64748b">
              {s}s
            </text>
          </g>
        ))}

        {/* Right-side labels: pct change + absolute $ diff */}
        {visible.length > 0 && (() => {
          const cx = PAD.left + plotW + 8
          const cy = toY(lastPct)
          return (
            <g>
              <text x={cx} y={cy - 4} fontSize={12} fontWeight="600" fill={color}>
                {lastPct >= 0 ? '+' : ''}{lastPct.toFixed(3)}%
              </text>
              <text x={cx} y={cy + 10} fontSize={10} fill={color} opacity={0.8}>
                {absDiff >= 0 ? '+$' : '-$'}{Math.abs(absDiff).toFixed(2)}
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
