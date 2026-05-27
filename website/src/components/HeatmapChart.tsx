import { useEffect, useState } from 'react'

interface Cell { dow: number; hour: number; count: number; up_rate: number | null }
interface HeatmapData { cells: Cell[]; days: string[]; hours: number[] }

type Mode = 'up_rate' | 'count'

// Diverging green–gray–red for UP rate (0 = full red, 0.5 = gray, 1 = full green)
function upRateColor(rate: number): string {
  if (rate >= 0.5) {
    const t = (rate - 0.5) / 0.5
    const g = Math.round(100 + t * (197 - 100))
    return `rgb(34,${g},78)`
  } else {
    const t = (0.5 - rate) / 0.5
    const r = Math.round(100 + t * (239 - 100))
    return `rgb(${r},68,68)`
  }
}

// Sequential blue for count
function countColor(count: number, max: number): string {
  const t = max > 0 ? count / max : 0
  const b = Math.round(80 + t * 175)
  const g = Math.round(10 + t * 80)
  return `rgb(30,${g},${b})`
}

const CELL_W = 28
const CELL_H = 18
const PAD_LEFT  = 44
const PAD_TOP   = 32
const PAD_RIGHT = 8
const PAD_BOT   = 8

export default function HeatmapChart() {
  const [data, setData]     = useState<HeatmapData | null>(null)
  const [mode, setMode]     = useState<Mode>('up_rate')
  const [tooltip, setTooltip] = useState<{ cell: Cell; svgX: number; svgY: number } | null>(null)

  useEffect(() => {
    fetch('/data/hourly_heatmap.json').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div className="flex items-center justify-center h-48 text-muted text-sm">Loading…</div>

  const { cells, days } = data

  const maxCount = Math.max(...cells.map(c => c.count))
  const svgW = PAD_LEFT + 24 * CELL_W + PAD_RIGHT
  const svgH = PAD_TOP  +  7 * CELL_H + PAD_BOT

  return (
    <div className="w-full overflow-x-auto select-none">
      {/* Mode tabs */}
      <div className="flex gap-2 mb-4">
        {(['up_rate', 'count'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              mode === m ? 'bg-accent text-white' : 'bg-surface-elevated text-muted hover:text-white'
            }`}>
            {m === 'up_rate' ? '▲ UP Rate' : '# Markets'}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg width={svgW} height={svgH} style={{ display: 'block' }}
          onMouseLeave={() => setTooltip(null)}>

          {/* Hour labels (X axis) */}
          {Array.from({ length: 24 }, (_, h) => (
            (h % 3 === 0) && (
              <text key={h} x={PAD_LEFT + h * CELL_W + CELL_W / 2}
                y={PAD_TOP - 6} textAnchor="middle" fontSize={9} fill="#64748b">
                {String(h).padStart(2, '0')}h
              </text>
            )
          ))}

          {/* Day labels (Y axis) */}
          {days.map((d, dow) => (
            <text key={dow} x={PAD_LEFT - 6} y={PAD_TOP + dow * CELL_H + CELL_H / 2 + 4}
              textAnchor="end" fontSize={10} fill="#94a3b8">
              {d}
            </text>
          ))}

          {/* Cells */}
          {cells.map(cell => {
            if (cell.count === 0) return null
            const cx = PAD_LEFT + cell.hour * CELL_W
            const cy = PAD_TOP  + cell.dow  * CELL_H
            const fill = mode === 'up_rate'
              ? (cell.up_rate !== null ? upRateColor(cell.up_rate) : '#1e293b')
              : countColor(cell.count, maxCount)
            const isHover = tooltip?.cell === cell

            return (
              <rect key={`${cell.dow}:${cell.hour}`}
                x={cx + 1} y={cy + 1}
                width={CELL_W - 2} height={CELL_H - 2}
                rx={2} fill={fill}
                stroke={isHover ? '#e2e8f0' : 'none'} strokeWidth={1.5}
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setTooltip({ cell, svgX: cx + CELL_W / 2, svgY: cy })}
              />
            )
          })}
        </svg>

        {/* Color legend */}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          {mode === 'up_rate' ? (
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
          ) : (
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
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (() => {
        const c = tooltip.cell
        return (
          <div className="mt-2 text-xs text-muted bg-surface-elevated border border-border rounded-lg px-3 py-2 inline-block">
            <span className="font-medium text-white">{days[c.dow]} {String(c.hour).padStart(2,'0')}:00 UTC</span>
            {' — '}
            <span className="text-white">{c.count} markets</span>
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
      })()}
    </div>
  )
}
