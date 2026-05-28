import { useEffect, useRef, useState } from 'react'

interface SecondData {
  second: number
  btc_pct_change: number    // already in % (e.g. 0.051 = +0.051%)
  btc_price: number
  yes_price: number         // implied probability of UP, in [0, 1]
}

export interface HistoricalSeries {
  implied: (number | null)[]    // length = seconds.length, values in [0, 1] or null
  realized: (number | null)[]   // same
}

interface Props {
  seconds: SecondData[]                          // full 300-second array
  historical?: HistoricalSeries | null           // precomputed from calibration lookup
  currentSecond: number                          // 0-299
}

const PAD = { top: 44, bottom: 28, left: 60, right: 130 }
const ACCENT = '#c084fc'       // live implied — project accent violet
const SKY = '#38bdf8'          // historical implied — sky blue
const AMBER = '#fbbf24'        // historical realized — amber

// Min vertical gap between right-side current-value labels.
const LABEL_MIN_GAP = 26

// ── Helpers ──────────────────────────────────────────────────────────────────
// SVG path that gracefully skips null points (creates gaps in the line).
function buildPath(points: { x: number; y: number | null }[]): string {
  let out = ''
  let lastValid = false
  for (const p of points) {
    if (p.y == null) {
      lastValid = false
    } else {
      out += `${lastValid ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `
      lastValid = true
    }
  }
  return out.trim()
}

// Distribute label y-positions so consecutive ones are ≥ minGap apart.
// Returns new positions in the same order as the input.
function distributeLabels(positions: number[], minGap: number, lo: number, hi: number): number[] {
  if (positions.length === 0) return []
  const sorted = positions.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  // Forward pass: enforce min gap
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k].y - sorted[k - 1].y < minGap) {
      sorted[k].y = sorted[k - 1].y + minGap
    }
  }
  // Clamp upper bound (pull stack up if last overflows)
  if (sorted[sorted.length - 1].y > hi) {
    const shift = sorted[sorted.length - 1].y - hi
    for (const it of sorted) it.y -= shift
  }
  // Clamp lower bound (push stack down if first overflows)
  if (sorted[0].y < lo) {
    const shift = lo - sorted[0].y
    for (const it of sorted) it.y += shift
  }
  const result = positions.slice()
  for (const it of sorted) result[it.i] = it.y
  return result
}

// ── Component ────────────────────────────────────────────────────────────────
export default function PriceChart({ seconds, historical, currentSecond }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(700)
  const H = 260

  // Visibility toggles for each curve. The user cannot hide all of them.
  // Only BTC change is shown by default — the user opts in to the probability
  // overlays to avoid overwhelming the first view.
  const [visible, setVisible] = useState({
    btc: true,
    liveImplied: false,
    histImplied: false,
    histRealized: false,
  })

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (seconds.length === 0) return <div ref={containerRef} style={{ height: H }} />

  const plotW = w - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const visibleData = seconds.slice(0, currentSecond + 1)

  // ── BTC Y scale (dynamic, symmetric around 0, only ever expands) ───────────
  const visY   = visibleData.map(s => s.btc_pct_change)
  const maxAbs = Math.max(0.005, ...visY.map(Math.abs))
  const padY   = Math.max(maxAbs * 0.25, 0.003)
  const yMin   = -(maxAbs + padY)
  const yMax   =  (maxAbs + padY)
  const yRange = yMax - yMin

  const toX  = (s: number) => PAD.left + (s / 299) * plotW
  const toYB = (v: number) => PAD.top + plotH - ((v - yMin) / yRange) * plotH
  const toYP = (p: number) => PAD.top + plotH - p * plotH      // implied [0,1]
  const y0   = toYB(0)

  // ── Last values ────────────────────────────────────────────────────────────
  const lastIdx     = visibleData.length - 1
  const lastPct     = visibleData[lastIdx]?.btc_pct_change ?? 0
  const lastPrice   = visibleData[lastIdx]?.btc_price ?? 0
  const initPrice   = seconds[0]?.btc_price ?? 0
  const absDiff     = lastPrice - initPrice
  const isPos       = lastPct >= 0
  const lastImplied = visibleData[lastIdx]?.yes_price ?? 0.5
  const lastHistImp = historical?.implied[lastIdx] ?? null
  const lastHistReal = historical?.realized[lastIdx] ?? null
  const green = '#22c55e'
  const red   = '#ef4444'
  const btcColor = isPos ? green : red

  // ── Paths ──────────────────────────────────────────────────────────────────
  const btcPoints = visibleData.map(d => ({
    x: toX(d.second),
    y: toYB(d.btc_pct_change) as number | null,
  }))
  const btcLine = buildPath(btcPoints)
  const btcFill = btcLine && visibleData.length > 1
    ? `${btcLine} L${toX(visibleData[lastIdx].second).toFixed(1)},${y0.toFixed(1)} L${toX(0).toFixed(1)},${y0.toFixed(1)} Z`
    : ''

  const liveImpLine = buildPath(visibleData.map(d => ({
    x: toX(d.second),
    y: toYP(d.yes_price) as number | null,
  })))

  const histImpLine = historical
    ? buildPath(visibleData.map((d, i) => ({
        x: toX(d.second),
        y: historical.implied[i] != null ? toYP(historical.implied[i]!) : null,
      })))
    : ''

  const histRealLine = historical
    ? buildPath(visibleData.map((d, i) => ({
        x: toX(d.second),
        y: historical.realized[i] != null ? toYP(historical.realized[i]!) : null,
      })))
    : ''

  // ── Axis ticks ─────────────────────────────────────────────────────────────
  const nTicks = 5
  const yTicks: number[] = Array.from({ length: nTicks + 1 }, (_, i) => yMin + (yRange / nTicks) * i)
  const probTicks = [0, 0.25, 0.5, 0.75, 1]
  const xTicks = [0, 60, 120, 180, 240, 299]

  // ── Right-side label positions (single distribution for ALL labels) ───────
  // Even though BTC uses the left axis and the 3 prob lines share the right
  // axis, all 4 labels are rendered at the same right-side column, so they
  // need joint vertical separation to avoid any overlap.
  const minY = PAD.top + 8
  const maxY = PAD.top + plotH - 8

  type LabelKey = 'btc' | 'liveImplied' | 'histImplied' | 'histRealized'
  type LabelSpec = { key: LabelKey; y: number }
  const allLabels: LabelSpec[] = []
  if (visible.btc)                                  allLabels.push({ key: 'btc',          y: toYB(lastPct) })
  if (visible.liveImplied)                          allLabels.push({ key: 'liveImplied',  y: toYP(lastImplied) })
  if (visible.histImplied && lastHistImp != null)   allLabels.push({ key: 'histImplied',  y: toYP(lastHistImp) })
  if (visible.histRealized && lastHistReal != null) allLabels.push({ key: 'histRealized', y: toYP(lastHistReal) })

  const distributed = distributeLabels(allLabels.map(l => l.y), LABEL_MIN_GAP, minY, maxY)
  const positions: Partial<Record<LabelKey, number>> = {}
  allLabels.forEach((l, i) => { positions[l.key] = distributed[i] })

  const cy_btc_raw = toYB(lastPct)

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  const visibleCount = Object.values(visible).filter(Boolean).length
  const toggle = (key: keyof typeof visible) => {
    if (visible[key] && visibleCount === 1) return   // can't hide the last one
    setVisible(v => ({ ...v, [key]: !v[key] }))
  }

  const hasHistorical = historical != null

  return (
    <div ref={containerRef} className="w-full select-none">

      {/* ── Toggle legend ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
        <LegendButton
          active={visible.btc}
          onClick={() => toggle('btc')}
          disabled={visible.btc && visibleCount === 1}
          swatchColor={btcColor}
        >
          BTC change <span className="text-muted">(left)</span>
        </LegendButton>

        <LegendButton
          active={visible.liveImplied}
          onClick={() => toggle('liveImplied')}
          disabled={visible.liveImplied && visibleCount === 1}
          swatchColor={ACCENT}
          dashed
        >
          Live implied ↑ UP <span className="text-muted">(right)</span>
        </LegendButton>

        {hasHistorical && (
          <>
            <LegendButton
              active={visible.histImplied}
              onClick={() => toggle('histImplied')}
              disabled={visible.histImplied && visibleCount === 1}
              swatchColor={SKY}
              dashed
            >
              Historical implied ↑ UP
            </LegendButton>

            <LegendButton
              active={visible.histRealized}
              onClick={() => toggle('histRealized')}
              disabled={visible.histRealized && visibleCount === 1}
              swatchColor={AMBER}
              dashed
            >
              Historical realized ↑ UP
            </LegendButton>
          </>
        )}
      </div>

      <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }}>

        {/* ── Grid (BTC ticks if BTC visible, else prob ticks) ─────────── */}
        {visible.btc
          ? yTicks.map((v, i) => (
              <line key={i}
                x1={PAD.left} y1={toYB(v)} x2={PAD.left + plotW} y2={toYB(v)}
                stroke="#1e293b" strokeWidth={1}
              />
            ))
          : probTicks.map((p, i) => (
              <line key={i}
                x1={PAD.left} y1={toYP(p)} x2={PAD.left + plotW} y2={toYP(p)}
                stroke="#1e293b" strokeWidth={1}
              />
            ))
        }

        {/* ── Zero reference (BTC) ──────────────────────────────────────── */}
        {visible.btc && (
          <line x1={PAD.left} y1={y0} x2={PAD.left + plotW} y2={y0}
            stroke="#475569" strokeWidth={1} strokeDasharray="5 3" />
        )}

        {/* ── 50% reference (any prob curve visible) ──────────────────── */}
        {(visible.liveImplied || visible.histImplied || visible.histRealized) && (
          <line x1={PAD.left} y1={toYP(0.5)} x2={PAD.left + plotW} y2={toYP(0.5)}
            stroke={ACCENT} strokeWidth={0.5} strokeDasharray="2 4" opacity={0.35} />
        )}

        {/* ── BTC fill ──────────────────────────────────────────────────── */}
        {visible.btc && btcFill && (
          <path d={btcFill} fill={isPos ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'} />
        )}

        {/* ── BTC line ─────────────────────────────────────────────────── */}
        {visible.btc && btcLine && (
          <path d={btcLine} fill="none" stroke={btcColor} strokeWidth={2} strokeLinejoin="round" />
        )}

        {/* ── Historical realized (drawn first, behind the implieds) ──── */}
        {visible.histRealized && histRealLine && (
          <path d={histRealLine} fill="none" stroke={AMBER} strokeWidth={1.75} strokeDasharray="4 2" strokeLinejoin="round" opacity={0.9} />
        )}

        {/* ── Historical implied ───────────────────────────────────────── */}
        {visible.histImplied && histImpLine && (
          <path d={histImpLine} fill="none" stroke={SKY} strokeWidth={1.75} strokeDasharray="4 2" strokeLinejoin="round" opacity={0.9} />
        )}

        {/* ── Live implied (drawn on top of historicals) ───────────────── */}
        {visible.liveImplied && liveImpLine && (
          <path d={liveImpLine} fill="none" stroke={ACCENT} strokeWidth={2} strokeDasharray="4 2" strokeLinejoin="round" />
        )}

        {/* ── Current dots (at raw line positions) ─────────────────────── */}
        {visibleData.length > 0 && visible.btc && (
          <circle cx={toX(visibleData[lastIdx].second)} cy={cy_btc_raw} r={4} fill={btcColor} />
        )}
        {visibleData.length > 0 && visible.liveImplied && (
          <circle cx={toX(visibleData[lastIdx].second)} cy={toYP(lastImplied)} r={4} fill={ACCENT} />
        )}
        {visibleData.length > 0 && visible.histImplied && lastHistImp != null && (
          <circle cx={toX(visibleData[lastIdx].second)} cy={toYP(lastHistImp)} r={3.5} fill={SKY} />
        )}
        {visibleData.length > 0 && visible.histRealized && lastHistReal != null && (
          <circle cx={toX(visibleData[lastIdx].second)} cy={toYP(lastHistReal)} r={3.5} fill={AMBER} />
        )}

        {/* ── Left Y axis labels (BTC pct change) ──────────────────────── */}
        {visible.btc && yTicks.map((v, i) => (
          <text key={i}
            x={PAD.left - 6} y={toYB(v) + 4}
            textAnchor="end" fontSize={10} fill="#64748b"
          >
            {v >= 0 ? '+' : ''}{v.toFixed(3)}%
          </text>
        ))}

        {/* ── Right Y axis labels (Implied prob 0..100%) ───────────────── */}
        {(visible.liveImplied || visible.histImplied || visible.histRealized) && probTicks.map((p, i) => (
          <text key={i}
            x={PAD.left + plotW + 6} y={toYP(p) + 4}
            textAnchor="start" fontSize={10} fill="#94a3b8" opacity={0.7}
          >
            {(p * 100).toFixed(0)}%
          </text>
        ))}

        {/* ── X axis ────────────────────────────────────────────────────── */}
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

        {/* ── Right-side current value labels (one per visible series) ── */}
        {(() => {
          const cx = PAD.left + plotW + 38
          return (
            <g>
              {visible.btc && positions.btc != null && (
                <LabelPair
                  cx={cx}
                  cy={positions.btc}
                  color={btcColor}
                  main={`${lastPct >= 0 ? '+' : ''}${lastPct.toFixed(3)}%`}
                  sub={`${absDiff >= 0 ? '+$' : '-$'}${Math.abs(absDiff).toFixed(2)}`}
                />
              )}
              {visible.liveImplied && positions.liveImplied != null && (
                <LabelPair
                  cx={cx}
                  cy={positions.liveImplied}
                  color={ACCENT}
                  main={`${(lastImplied * 100).toFixed(1)}%`}
                  sub="live implied"
                />
              )}
              {visible.histImplied && positions.histImplied != null && lastHistImp != null && (
                <LabelPair
                  cx={cx}
                  cy={positions.histImplied}
                  color={SKY}
                  main={`${(lastHistImp * 100).toFixed(1)}%`}
                  sub="hist. implied"
                />
              )}
              {visible.histRealized && positions.histRealized != null && lastHistReal != null && (
                <LabelPair
                  cx={cx}
                  cy={positions.histRealized}
                  color={AMBER}
                  main={`${(lastHistReal * 100).toFixed(1)}%`}
                  sub="hist. realized"
                />
              )}
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ── Small reusable label group for the right-side current values ───────────
function LabelPair({ cx, cy, color, main, sub }: {
  cx: number; cy: number; color: string; main: string; sub: string
}) {
  return (
    <g>
      <text x={cx} y={cy - 2} fontSize={11} fontWeight="600" fill={color}>
        {main}
      </text>
      <text x={cx} y={cy + 10} fontSize={9} fill={color} opacity={0.75}>
        {sub}
      </text>
    </g>
  )
}

// ── Legend toggle button ───────────────────────────────────────────────────
// MUST live at module scope (not inside PriceChart) — defining it in the
// component body would create a fresh function reference on every tick,
// which React treats as a different component type and unmount/remount-s
// each button, causing visible blinks and a brief un-clickable window.
function LegendButton({
  active, onClick, disabled, swatchColor, dashed, children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  swatchColor: string
  dashed?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all ${
        active
          ? 'border-border bg-surface text-gray-200 hover:border-accent'
          : 'border-border/40 bg-transparent text-muted opacity-50 hover:opacity-80'
      } disabled:cursor-not-allowed disabled:hover:border-border`}
    >
      {dashed ? (
        <svg width="14" height="2" className="inline-block">
          <line x1="0" y1="1" x2="14" y2="1" stroke={swatchColor} strokeWidth="2" strokeDasharray="4 2" />
        </svg>
      ) : (
        <span className="inline-block w-[14px] h-[2px]" style={{ background: swatchColor }} />
      )}
      {children}
    </button>
  )
}
