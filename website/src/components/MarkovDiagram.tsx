import { useEffect, useRef, useState } from 'react'
import InsightCallout from './layout/InsightCallout'

interface Transitions { uu: number; ud: number; du: number; dd: number }
interface Marginals   { up: number; down: number }
interface StreakEntry { length: number; up: number; down: number }
interface MarkovData  {
  transitions: Transitions
  marginals: Marginals
  streaks: StreakEntry[]
  counts: { uu: number; ud: number; du: number; dd: number }
}

const GREEN = '#22c55e'
const RED   = '#ef4444'
const DIM   = '#1e3a5f'
const GRAY  = '#64748b'

// Simulation playback speed pills. `ms` is the per-step delay used by the
// timer; the label is what we render on the button. Hoisted out of the
// JSX so the array isn't re-allocated on every render.
const SPEED_OPTIONS = [
  { ms: 500, label: '1×' },
  { ms: 250, label: '2×' },
  { ms: 100, label: '4×' },
] as const

// ── Geometry ──────────────────────────────────────────────────────────────────
type Pt = [number, number]

/** Sample a QUADRATIC bezier at t ∈ [0,1] */
function qBez(P0: Pt, P1: Pt, P2: Pt, t: number): Pt {
  const m = 1 - t
  return [m*m*P0[0] + 2*m*t*P1[0] + t*t*P2[0],
          m*m*P0[1] + 2*m*t*P1[1] + t*t*P2[1]]
}

/** Build SVG polygon string for an arrowhead; tip is the endpoint, prev is a sample just before it */
function arrowHead(prev: Pt, tip: Pt, size = 11): string {
  const dx = tip[0] - prev[0], dy = tip[1] - prev[1]
  const len = Math.sqrt(dx*dx + dy*dy) || 1
  const ux = dx/len, uy = dy/len
  const px = -uy,    py = ux
  const w  = size * 0.38
  return `${tip[0]},${tip[1]} ${tip[0]-ux*size+px*w},${tip[1]-uy*size+py*w} ${tip[0]-ux*size-px*w},${tip[1]-uy*size-py*w}`
}

/** Point on circle at angle θ degrees (0°=right, CCW positive, SVG y-down) */
function onCircle(cx: number, cy: number, r: number, deg: number): Pt {
  const rad = deg * Math.PI / 180
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)]
}

// ── Layout constants ──────────────────────────────────────────────────────────
const VW = 560; const VH = 290
const DCX = 150; const DCY = 145; const DR = 52   // DOWN node
const UCX = 410; const UCY = 145; const UR = 52   // UP node

// ── Precomputed paths (all quadratic beziers) ─────────────────────────────────

// UP→DOWN: arc ABOVE the line
const UD = (() => {
  const P0 = onCircle(UCX, UCY, UR, 150)  // upper-left of UP  ≈ (365, 119)
  const P2 = onCircle(DCX, DCY, DR,  30)  // upper-right of DOWN ≈ (195, 119)
  const P1: Pt = [280, 40]
  const d  = `M ${P0[0].toFixed(1)} ${P0[1].toFixed(1)} Q ${P1[0]} ${P1[1]} ${P2[0].toFixed(1)} ${P2[1].toFixed(1)}`
  const apex   = qBez(P0, P1, P2, 0.5)
  const prev   = qBez(P0, P1, P2, 0.90)
  return { d, P0, P1, P2, apex, arrow: arrowHead(prev, P2), labelY: apex[1] - 22 }
})()

// DOWN→UP: arc BELOW the line
const DU = (() => {
  const P0 = onCircle(DCX, DCY, DR, -30)  // lower-right of DOWN ≈ (195, 171)
  const P2 = onCircle(UCX, UCY, UR, -150) // lower-left of UP  ≈ (365, 171)
  const P1: Pt = [280, 250]
  const d  = `M ${P0[0].toFixed(1)} ${P0[1].toFixed(1)} Q ${P1[0]} ${P1[1]} ${P2[0].toFixed(1)} ${P2[1].toFixed(1)}`
  const apex   = qBez(P0, P1, P2, 0.5)
  const prev   = qBez(P0, P1, P2, 0.90)
  return { d, P0, P1, P2, apex, arrow: arrowHead(prev, P2), labelY: apex[1] + 24 }
})()

// DOWN→DOWN self-loop: QUADRATIC arc to upper-left (single control → no twist)
const DD = (() => {
  const P0 = onCircle(DCX, DCY, DR, 120)  // upper-left of DOWN ≈ (124, 100)
  const P1: Pt = [75, 32]                  // control far upper-left
  const P2 = onCircle(DCX, DCY, DR, 160)  // left side of DOWN  ≈ (101, 127)
  const d  = `M ${P0[0].toFixed(1)} ${P0[1].toFixed(1)} Q ${P1[0]} ${P1[1]} ${P2[0].toFixed(1)} ${P2[1].toFixed(1)}`
  const prev   = qBez(P0, P1, P2, 0.90)
  return { d, P0, P1, P2, prev, arrow: arrowHead(prev, P2), labelPos: [52, 62] as Pt }
})()

// UP→UP self-loop: QUADRATIC arc to upper-right (single control → no twist)
const UU = (() => {
  const P0 = onCircle(UCX, UCY, UR,  20)  // right side of UP   ≈ (459, 127)
  const P1: Pt = [485, 32]                 // control far upper-right
  const P2 = onCircle(UCX, UCY, UR,  60)  // upper-right of UP  ≈ (436, 100)
  const d  = `M ${P0[0].toFixed(1)} ${P0[1].toFixed(1)} Q ${P1[0]} ${P1[1]} ${P2[0].toFixed(1)} ${P2[1].toFixed(1)}`
  const prev   = qBez(P0, P1, P2, 0.90)
  return { d, P0, P1, P2, prev, arrow: arrowHead(prev, P2), labelPos: [508, 62] as Pt }
})()

// ── Streak histogram ──────────────────────────────────────────────────────────
function StreakHistogram({ streaks }: { streaks: StreakEntry[] }) {
  const maxCount = Math.max(...streaks.flatMap(s => [s.up, s.down]), 1)
  const W = 500; const H = 150
  const PL = 44; const PR = 12; const PT = 12; const PB = 32
  const plotW = W - PL - PR; const plotH = H - PT - PB
  const barW  = plotW / streaks.length
  const pairW = barW * 0.40
  const toY = (n: number) => PT + plotH - (n / maxCount) * plotH

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={PL} y1={PT+plotH*(1-f)} x2={PL+plotW} y2={PT+plotH*(1-f)}
          stroke="#1e293b" strokeWidth={1} />
      ))}
      {streaks.map((s, i) => {
        const bx = PL + i * barW + barW * 0.1
        return (
          <g key={s.length}>
            <rect x={bx}         y={toY(s.up)}   width={pairW} height={Math.max(toY(0)-toY(s.up),0)}   fill={GREEN} opacity={0.85} rx={1.5} />
            <rect x={bx+pairW+2} y={toY(s.down)} width={pairW} height={Math.max(toY(0)-toY(s.down),0)} fill={RED}   opacity={0.85} rx={1.5} />
            <text x={bx+pairW} y={H-16} textAnchor="middle" fontSize={9} fill={GRAY}>{s.length}</text>
          </g>
        )
      })}
      <line x1={PL} y1={PT} x2={PL} y2={PT+plotH} stroke="#334155" strokeWidth={1} />
      <line x1={PL} y1={PT+plotH} x2={PL+plotW} y2={PT+plotH} stroke="#334155" strokeWidth={1} />
      {[0, Math.round(maxCount/2), maxCount].map(v => (
        <text key={v} x={PL-4} y={toY(v)+4} textAnchor="end" fontSize={9} fill={GRAY}>{v}</text>
      ))}
      <text x={PL+plotW/2} y={H-2} textAnchor="middle" fontSize={10} fill={GRAY}>
        Consecutive same-outcome streak length
      </text>
    </svg>
  )
}

// ── Simulation ────────────────────────────────────────────────────────────────
type S = 'up' | 'down'
function nextState(s: S, t: Transitions): S {
  return s === 'up' ? (Math.random() < t.uu ? 'up' : 'down') : (Math.random() < t.du ? 'up' : 'down')
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarkovDiagram() {
  const [data, setData]     = useState<MarkovData | null>(null)
  const [hover, setHover]   = useState<string | null>(null)
  const [simState, setSimState] = useState<S | null>(null)
  const [simPath,  setSimPath]  = useState<S[]>([])
  const [cursor,   setCursor]   = useState(-1)
  const [running,  setRunning]  = useState(false)
  const [speed,    setSpeed]    = useState(500)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The simulation loop is driven by chained setTimeouts started in
  // `startSim`, which closes over `speed` at start time. We mirror the
  // latest speed into a ref so the loop reads the current value when
  // scheduling its next tick - lets the user change speed mid-run.
  const speedRef = useRef(speed)
  useEffect(() => { speedRef.current = speed }, [speed])

  useEffect(() => {
    fetch('/data/markov.json').then(r => r.json()).then(setData)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  if (!data) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>

  const { transitions: t, marginals, streaks } = data

  const startSim = () => {
    if (running) return
    const init: S = Math.random() < marginals.up ? 'up' : 'down'
    const path: S[] = [init]
    for (let i = 0; i < 19; i++) path.push(nextState(path[path.length - 1], t))
    setSimPath(path); setSimState(path[0]); setCursor(0); setRunning(true)
    let idx = 0
    const advance = () => {
      idx++
      if (idx >= path.length) { setRunning(false); setCursor(-1); return }
      setSimState(path[idx]); setCursor(idx)
      // Re-read speedRef each time so speed changes take effect on the
      // very next tick rather than waiting for a Reset → Start cycle.
      timerRef.current = setTimeout(advance, speedRef.current)
    }
    timerRef.current = setTimeout(advance, speedRef.current)
  }

  const resetSim = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setRunning(false); setSimState(null); setSimPath([]); setCursor(-1)
  }

  const activeEdge = hover ?? (cursor > 0 ? `${simPath[cursor-1][0]}${simPath[cursor][0]}` : null)

  // Per-edge color: white when active, base color when nothing active, dimmed otherwise
  const ec = (id: string, base: string) =>
    activeEdge === null ? base : activeEdge === id ? '#f1f5f9' : DIM
  const ew = (id: string) => activeEdge === id ? 3 : 1.8

  const nodeRing = (who: S) => simState === who ? '#f1f5f9' : (who === 'up' ? GREEN : RED)
  const nodeW    = (who: S) => simState === who ? 3.5 : 2

  const label = (id: string, prob: number, count: number, base: string, x: number, y: number, anchor: string = 'middle') => (
    <g>
      <text x={x} y={y}    textAnchor={anchor as any} fontSize={12.5} fontWeight="700" fill={ec(id, base)}>
        {(prob * 100).toFixed(1)}%
      </text>
      <text x={x} y={y+13} textAnchor={anchor as any} fontSize={9}    fill={ec(id, base)} opacity={0.65}>
        n={count.toLocaleString()}
      </text>
    </g>
  )

  return (
    <div className="flex flex-col gap-6">

      {/* Diagram card + its inline takeaway are wrapped together so the
          parent's gap-6 only spaces them away from the streak histogram
          below - the callout itself sits tight under the diagram with
          just its own mt-3. */}
      <div>

      {/* ── Diagram card ── */}
      <div className="rounded-xl border border-border bg-surface-elevated p-4">
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ display: 'block', width: '100%', maxWidth: VW }}
          className="mx-auto" onMouseLeave={() => setHover(null)}>

          {/* UP→DOWN (red, above) */}
          <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHover('ud')} onMouseLeave={() => setHover(null)}>
            <path d={UD.d} fill="none" stroke={ec('ud', RED)} strokeWidth={ew('ud')} />
            <polygon points={UD.arrow} fill={ec('ud', RED)} />
            {label('ud', t.ud, data.counts.ud, RED, UD.apex[0], UD.labelY)}
          </g>

          {/* DOWN→UP (green, below) */}
          <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHover('du')} onMouseLeave={() => setHover(null)}>
            <path d={DU.d} fill="none" stroke={ec('du', GREEN)} strokeWidth={ew('du')} />
            <polygon points={DU.arrow} fill={ec('du', GREEN)} />
            {label('du', t.du, data.counts.du, GREEN, DU.apex[0], DU.labelY)}
          </g>

          {/* DOWN→DOWN self-loop (red, upper-left) */}
          <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHover('dd')} onMouseLeave={() => setHover(null)}>
            <path d={DD.d} fill="none" stroke={ec('dd', RED)} strokeWidth={ew('dd')} />
            <polygon points={DD.arrow} fill={ec('dd', RED)} />
            {label('dd', t.dd, data.counts.dd, RED, DD.labelPos[0], DD.labelPos[1], 'end')}
          </g>

          {/* UP→UP self-loop (green, upper-right) */}
          <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHover('uu')} onMouseLeave={() => setHover(null)}>
            <path d={UU.d} fill="none" stroke={ec('uu', GREEN)} strokeWidth={ew('uu')} />
            <polygon points={UU.arrow} fill={ec('uu', GREEN)} />
            {label('uu', t.uu, data.counts.uu, GREEN, UU.labelPos[0], UU.labelPos[1], 'start')}
          </g>

          {/* DOWN node */}
          <circle cx={DCX} cy={DCY} r={DR}
            fill="rgba(239,68,68,0.13)" stroke={nodeRing('down')} strokeWidth={nodeW('down')} />
          <text x={DCX} y={DCY-8}  textAnchor="middle" fontSize={13} fontWeight="700" fill={RED}>▼ DOWN</text>
          <text x={DCX} y={DCY+12} textAnchor="middle" fontSize={11} fill="#94a3b8">{(marginals.down*100).toFixed(1)}%</text>

          {/* UP node */}
          <circle cx={UCX} cy={UCY} r={UR}
            fill="rgba(34,197,94,0.13)" stroke={nodeRing('up')} strokeWidth={nodeW('up')} />
          <text x={UCX} y={UCY-8}  textAnchor="middle" fontSize={13} fontWeight="700" fill={GREEN}>▲ UP</text>
          <text x={UCX} y={UCY+12} textAnchor="middle" fontSize={11} fill="#94a3b8">{(marginals.up*100).toFixed(1)}%</text>
        </svg>

        {/* Sim path display */}
        {simPath.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1 justify-center">
            {simPath.map((s, i) => (
              <span key={i} className="text-xs font-mono font-bold px-1.5 py-0.5 rounded transition-all duration-100"
                style={{
                  color: s === 'up' ? GREEN : RED,
                  background: i === cursor ? (s==='up' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)') : 'transparent',
                  border: `1px solid ${i <= cursor ? (s==='up' ? GREEN : RED) : 'transparent'}`,
                  opacity: cursor >= 0 && i > cursor ? 0.22 : 1,
                }}>
                {s === 'up' ? 'U' : 'D'}
              </span>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button onClick={running ? resetSim : startSim}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
              running ? 'bg-slate-600 hover:bg-slate-500' : 'bg-accent hover:bg-blue-500'
            }`}>
            {running ? '■ Stop' : '▶ Run 20 steps'}
          </button>
          {simPath.length > 0 && !running && (
            <button onClick={resetSim}
              className="px-3 py-2 rounded-lg text-sm text-muted hover:text-white bg-surface-elevated border border-border transition-colors">
              Reset
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted">Speed:</span>
            {SPEED_OPTIONS.map(s => (
              <button key={s.ms} onClick={() => setSpeed(s.ms)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  speed === s.ms ? 'bg-accent text-white' : 'bg-surface-elevated text-muted hover:text-white border border-border'
                }`}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Diagram-specific takeaway: the four arrows themselves. */}
      <InsightCallout>
        All four arrows land within <span className="text-white">~2 pp</span> of
        50%. The largest deviation, DOWN → UP at{' '}
        <span className="text-white">{(t.du * 100).toFixed(1)}%</span>, is a
        mild mean-reversion blip well inside fair-coin sampling noise at this
        sample size. UP → UP at{' '}
        <span className="text-white">{(t.uu * 100).toFixed(1)}%</span> barely
        moves the needle. Knowing the previous outcome gives you no edge on
        the next one.
      </InsightCallout>

      </div>

      {/* ── Streak histogram ── */}
      <div className="rounded-xl border border-border bg-surface-elevated p-4">
        <div className="flex items-center gap-5 mb-3">
          <span className="text-sm font-semibold text-white">Streak length distribution</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: GREEN }} />UP streaks
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: RED }} />DOWN streaks
          </span>
        </div>
        <StreakHistogram streaks={streaks} />
      </div>

    </div>
  )
}
