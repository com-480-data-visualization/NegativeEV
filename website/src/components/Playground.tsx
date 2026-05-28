import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import PriceChart, { type HistoricalSeries } from './PriceChart'
import CalibrationPanel from './CalibrationPanel'
import InfoTooltip from './InfoTooltip'
import { lookupCalibration, type CalibrationLookup } from '../lib/calibration'

// ── Types ────────────────────────────────────────────────────────────────────
interface SecondData {
  time_remaining: number
  second: number
  btc_price: number
  btc_pct_change: number
  yes_price: number   // UP token price  (0–1)
  no_price: number    // DOWN token price (0–1)
}

interface EventData {
  index: number
  event_timestamp: number
  slug: string
  winner: string
  winner_binary: number   // 1 = UP wins, 0 = DOWN wins
  seconds: SecondData[]   // sorted by second, length = 300
}

interface Resolution {
  winner: 'UP' | 'DOWN'
  winTokens: number
  loseTokens: number
  payout: number
}

interface GameState {
  events: EventData[]
  gameIdx: number
  tick: number          // 0–299 (current second index)
  balance: number
  upQty: number
  downQty: number
  nTrades: number       // cumulative buy + sell count over the whole session
  phase: 'loading' | 'playing' | 'resolved'
  resolution: Resolution | null
}

type Action =
  | { type: 'init'; events: EventData[] }
  | { type: 'tick' }
  | { type: 'buy'; dir: 'up' | 'down'; qty: number; price: number }
  | { type: 'sell'; dir: 'up' | 'down'; qty: number; price: number }
  | { type: 'next_market' }

// ── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {

    case 'init':
      return { ...state, events: action.events, phase: 'playing' }

    case 'tick': {
      if (state.phase !== 'playing') return state
      const next = state.tick + 1
      if (next > 299) {
        // Market over — resolve outcome from actual price movement
        const ev = state.events[state.gameIdx]
        const firstPrice = ev.seconds[0]?.btc_price ?? 0
        const lastPrice  = ev.seconds[ev.seconds.length - 1]?.btc_price ?? 0
        const winUp = lastPrice > firstPrice
        const payout = winUp ? state.upQty : state.downQty
        return {
          ...state,
          balance: state.balance + payout,
          upQty: 0,
          downQty: 0,
          phase: 'resolved',
          resolution: {
            winner: winUp ? 'UP' : 'DOWN',
            winTokens: winUp ? state.upQty : state.downQty,
            loseTokens: winUp ? state.downQty : state.upQty,
            payout,
          },
        }
      }
      return { ...state, tick: next }
    }

    case 'buy': {
      if (state.phase !== 'playing') return state
      const cost = action.qty * action.price
      if (cost <= 0 || cost > state.balance) return state
      return {
        ...state,
        balance: state.balance - cost,
        upQty:   action.dir === 'up'   ? state.upQty   + action.qty : state.upQty,
        downQty: action.dir === 'down' ? state.downQty + action.qty : state.downQty,
        nTrades: state.nTrades + 1,
      }
    }

    case 'sell': {
      if (state.phase !== 'playing') return state
      const held = action.dir === 'up' ? state.upQty : state.downQty
      if (action.qty <= 0 || action.qty > held) return state
      return {
        ...state,
        balance: state.balance + action.qty * action.price,
        upQty:   action.dir === 'up'   ? state.upQty   - action.qty : state.upQty,
        downQty: action.dir === 'down' ? state.downQty - action.qty : state.downQty,
        nTrades: state.nTrades + 1,
      }
    }

    case 'next_market':
      return {
        ...state,
        gameIdx: (state.gameIdx + 1) % state.events.length,
        tick: 0,
        phase: 'playing',
        resolution: null,
      }

    default:
      return state
  }
}

const INITIAL: GameState = {
  events: [], gameIdx: 0, tick: 0,
  balance: 100, upQty: 0, downQty: 0,
  nTrades: 0,
  phase: 'loading', resolution: null,
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2) { return n.toFixed(d) }
function fmtUSD(n: number) {
  const s = Math.abs(n).toFixed(2)
  return (n >= 0 ? '+$' : '-$') + s
}

// ── Sub-section header ───────────────────────────────────────────────────────
// Used INSIDE the playground only. The uppercase tracking-widest accent eyebrow
// is reserved for the page-level sections in App.tsx (Calibration, Playground).
interface SubSectionHeaderProps {
  title: string
  tooltip?: string
  right?: ReactNode
}

function SubSectionHeader({ title, tooltip, right }: SubSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-border/60">
      <h3 className="text-base font-semibold text-white flex items-center">
        <span>{title}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </h3>
      {right}
    </div>
  )
}

// ── Trade panel ──────────────────────────────────────────────────────────────
interface TradePanelProps {
  dir: 'up' | 'down'
  price: number
  balance: number
  held: number
  disabled: boolean
  onBuy: (qty: number) => void
  onSell: (qty: number) => void
}

function TradePanel({ dir, price, balance, held, disabled, onBuy, onSell }: TradePanelProps) {
  const [qty, setQty] = useState('')
  const [msg, setMsg] = useState('')

  const parsed = parseFloat(qty)
  const valid  = Number.isFinite(parsed) && parsed > 0
  const cost   = valid ? parsed * price : 0
  const canBuy = valid && cost <= balance
  const canSell = valid && parsed <= held
  const maxBuy = price > 0 ? Math.floor(balance / price) : 0

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2000) }

  const handleBuy = () => {
    if (!canBuy) { flash(cost > balance ? 'Insufficient balance' : 'Invalid quantity'); return }
    onBuy(parsed); setQty(''); flash(`Bought ${fmt(parsed, 1)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }
  const handleSell = () => {
    if (!canSell) { flash(parsed > held ? `Only ${fmt(held, 2)} tokens held` : 'Invalid quantity'); return }
    onSell(parsed); setQty(''); flash(`Sold ${fmt(parsed, 1)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }
  const handleSellAll = () => {
    if (held <= 0) { flash('No tokens to sell'); return }
    onSell(held); setQty(''); flash(`Sold all ${fmt(held, 2)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }

  const isUp = dir === 'up'
  const accent = isUp ? 'text-green-400' : 'text-red-400'
  const bg     = isUp ? 'bg-green-400/10 border-green-400/30' : 'bg-red-400/10 border-red-400/30'
  const btnBuy  = isUp ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
  const btnSell = 'bg-slate-600 hover:bg-slate-500'

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${bg}`}>
      <div className="flex items-center justify-between">
        <span className={`font-semibold text-sm ${accent}`}>{isUp ? '↑ UP' : '↓ DOWN'} token</span>
        <span className="text-xs text-muted">Price: <span className="text-white font-mono">${fmt(price, 4)}</span></span>
      </div>

      {/* Quantity input + quick presets */}
      <div className="flex gap-2">
        <input
          type="number" min="0" step="1" placeholder="Qty"
          value={qty} onChange={e => setQty(e.target.value)}
          disabled={disabled}
          className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent disabled:opacity-40"
        />
        {[10, 100].map(n => (
          <button key={n} onClick={() => setQty(String(n))} disabled={disabled}
            className="px-2 py-1 rounded-lg border border-border bg-surface text-xs text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-30 shrink-0">
            {n}
          </button>
        ))}
        <button
          onClick={() => setQty(String(maxBuy))}
          disabled={disabled || maxBuy <= 0}
          title={`Max tokens you can buy at $${fmt(price, 4)}: ${maxBuy}`}
          className="px-2 py-1 rounded-lg border border-border bg-surface text-xs text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-30 shrink-0"
        >
          max
        </button>
      </div>

      {valid && (
        <div className="text-xs text-muted">
          Cost: <span className="text-white">${fmt(cost, 2)}</span>
          {' · '}Payout: <span className={accent}>${fmt(parsed, 2)}</span>
          <span className="text-muted/70"> if {isUp ? '↑ UP' : '↓ DOWN'} wins</span>
        </div>
      )}

      {/* Buy / Sell / Sell All */}
      <div className="flex gap-2">
        <button onClick={handleBuy} disabled={disabled || !canBuy}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-colors disabled:opacity-30 ${btnBuy}`}>
          Buy
        </button>
        <button onClick={handleSell} disabled={disabled || !canSell}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-colors disabled:opacity-30 ${btnSell}`}>
          Sell
        </button>
        <button onClick={handleSellAll} disabled={disabled || held <= 0}
          className="rounded-lg px-3 py-2 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-30 shrink-0">
          All
        </button>
      </div>
      {msg && <p className="text-xs text-center text-muted animate-pulse">{msg}</p>}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Playground() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const [speed, setSpeed] = useState(3)   // 1x = 1 tick/s, 3x default
  const [paused, setPaused] = useState(false)
  const [calibration, setCalibration] = useState<CalibrationLookup | null>(null)

  // Load events
  useEffect(() => {
    fetch('/data/playground_events.json')
      .then(r => r.json())
      .then(p => dispatch({ type: 'init', events: p.events }))
      .catch(e => console.error('Failed to load playground events', e))
  }, [])

  // Load calibration lookup table
  useEffect(() => {
    fetch('/data/calibration_lookup.json')
      .then(r => r.json())
      .then(setCalibration)
      .catch(e => console.error('Failed to load calibration lookup', e))
  }, [])

  // Tick timer
  useEffect(() => {
    if (state.phase !== 'playing' || paused) return
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000 / speed)
    return () => clearInterval(id)
  }, [state.phase, state.gameIdx, speed, paused])

  // Auto-advance after resolution
  useEffect(() => {
    if (state.phase !== 'resolved') return
    const id = setTimeout(() => dispatch({ type: 'next_market' }), 3500)
    return () => clearTimeout(id)
  }, [state.phase, state.gameIdx])

  const event = state.events[state.gameIdx]
  const data  = event?.seconds[state.tick]

  const yesPrice = data?.yes_price ?? 0.5
  const noPrice  = data?.no_price  ?? 0.5
  const btcPrice = data?.btc_price ?? 0

  // Portfolio value including open token positions
  const portfolioValue = state.balance + state.upQty * yesPrice + state.downQty * noPrice
  const pnl = portfolioValue - 100

  const isResolved = state.phase === 'resolved'
  const tradingDisabled = isResolved || state.phase === 'loading'

  const timeRemaining = data?.time_remaining ?? 300
  const mm = String(Math.floor(timeRemaining / 60)).padStart(2, '0')
  const ss = String(timeRemaining % 60).padStart(2, '0')

  // Live calibration readout: P(UP | T, ΔBTC) from historical data,
  // both market-implied and realized — see scripts/export_calibration_lookup.py.
  const btcPctChange = data?.btc_pct_change ?? 0
  const calibPoint = useMemo(() => {
    if (!calibration) return null
    return lookupCalibration(calibration, timeRemaining, btcPctChange)
  }, [calibration, timeRemaining, btcPctChange])

  // Precompute the historical series (implied + realized) for every second of
  // the current market. Recomputed only when the market or lookup changes —
  // not on every tick — so it scales well.
  const historicalSeries: HistoricalSeries | null = useMemo(() => {
    if (!event || !calibration) return null
    const implied: (number | null)[] = []
    const realized: (number | null)[] = []
    for (const s of event.seconds) {
      const p = lookupCalibration(calibration, s.time_remaining, s.btc_pct_change)
      implied.push(p.implied)
      realized.push(p.realized)
    }
    return { implied, realized }
  }, [event, calibration])

  if (state.phase === 'loading') {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm gap-2">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
        Loading market data…
      </div>
    )
  }

  const speedControls = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setPaused(p => !p)}
        aria-label={paused ? 'Resume' : 'Pause'}
        title={paused ? 'Resume' : 'Pause'}
        className="inline-flex items-center justify-center w-7 h-7 rounded bg-surface-elevated text-gray-200 hover:text-white hover:bg-accent transition-colors"
      >
        {paused ? (
          // Play icon
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
            <path d="M0 0 L10 6 L0 12 Z" />
          </svg>
        ) : (
          // Pause icon
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
            <rect x="0" y="0" width="3" height="12" />
            <rect x="7" y="0" width="3" height="12" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-1">
        <span className="text-xs text-muted mr-1">Speed:</span>
        {[1, 3, 6, 10].map(s => (
          <button key={s} onClick={() => setSpeed(s)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              speed === s ? 'bg-accent text-white' : 'bg-surface-elevated text-muted hover:text-white'
            }`}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-8">

      {/* ── 1. Historical Prediction Insight ─────────────────────────────── */}
      <section>
        <SubSectionHeader
          title="Historical Prediction Insight"
          tooltip="Live readout from our calibration analysis of 9,181 historical BTC 5-min markets. Given the current time remaining and BTC price move since round open, what did similar past situations look like — and how does this market's pricing compare?"
        />
        {calibPoint
          ? (
            <CalibrationPanel
              point={calibPoint}
              liveImplied={yesPrice}
              upQty={state.upQty}
              downQty={state.downQty}
              balance={state.balance}
              remainingMarkets={Math.max(0, state.events.length - state.gameIdx)}
            />
          )
          : (
            <div className="rounded-xl border border-border bg-surface-elevated p-4 text-sm text-muted">
              Loading historical calibration data…
            </div>
          )
        }
      </section>

      {/* ── 2. Live market ───────────────────────────────────────────────── */}
      <section>
        <SubSectionHeader title="Live market" right={speedControls} />

        {/* Market meta strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {/* BTC price */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4">
            <div className="text-xs text-muted mb-1">BTC price</div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              ${btcPrice.toLocaleString('en', { maximumFractionDigits: 2 })}
            </div>
            <div className={`text-xs font-medium mt-0.5 ${btcPctChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {btcPctChange >= 0 ? '+' : ''}{(btcPctChange).toFixed(3)}% since open
            </div>
          </div>

          {/* Time remaining */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4">
            <div className="text-xs text-muted mb-1">Time remaining</div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">{mm}:{ss}</div>
            <div className="text-xs text-muted mt-0.5">until resolution</div>
          </div>

          {/* Market progress + slug (merged) */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4 min-w-0">
            <div className="text-xs text-muted mb-1">Market</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {state.gameIdx + 1}
              <span className="text-muted text-base font-normal"> / {state.events.length}</span>
            </div>
            <div className="text-xs text-muted mt-0.5 font-mono truncate" title={event?.slug}>
              {event?.slug ?? '—'}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="relative rounded-2xl border border-border bg-surface-elevated px-4 pt-4 pb-2">
          {event && (
            <PriceChart
              seconds={event.seconds}
              historical={historicalSeries}
              currentSecond={state.tick}
            />
          )}

          {/* Resolution overlay */}
          {isResolved && state.resolution && (
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(15,17,23,0.88)', backdropFilter: 'blur(4px)' }}>
              <div className="text-center">
                <div className={`text-4xl font-bold mb-2 ${
                  state.resolution.winner === 'UP' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {state.resolution.winner === 'UP' ? '↑ UP' : '↓ DOWN'} wins!
                </div>
                {state.resolution.winTokens > 0 ? (
                  <div className="text-white text-lg">
                    {fmt(state.resolution.winTokens, 2)} tokens → <span className="text-green-400 font-bold">${fmt(state.resolution.payout, 2)}</span>
                  </div>
                ) : (
                  <div className="text-muted">No winning tokens held</div>
                )}
                {state.resolution.loseTokens > 0 && (
                  <div className="text-red-400/70 text-sm mt-1">
                    {fmt(state.resolution.loseTokens, 2)} losing tokens → $0
                  </div>
                )}
                <div className="text-muted text-sm mt-3 animate-pulse">Next market starting…</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 3. Wallet & trading (wallet strip + trade panels) ─────────────── */}
      <section>
        <SubSectionHeader
          title="Your wallet & trading account"
          tooltip="Your live portfolio and trading actions. The cards on top show your cash balance, open token positions, and total trade count. Buy or sell tokens at the live market price below — trades are disabled once the market resolves."
        />

        {/* Portfolio strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {/* Balance */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4">
            <div className="text-xs text-muted mb-1">Balance</div>
            <div className="text-xl font-bold text-white tabular-nums">${fmt(state.balance, 2)}</div>
            <div className={`text-xs font-medium mt-0.5 ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtUSD(pnl)} P&L
            </div>
          </div>

          {/* UP tokens */}
          <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
            <div className="text-xs text-muted mb-1">↑ UP tokens</div>
            <div className="text-xl font-bold text-white tabular-nums">{fmt(state.upQty, 2)}</div>
            <div className="text-xs text-muted mt-0.5">≈ ${fmt(state.upQty * yesPrice, 2)}</div>
          </div>

          {/* DOWN tokens */}
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
            <div className="text-xs text-muted mb-1">↓ DOWN tokens</div>
            <div className="text-xl font-bold text-white tabular-nums">{fmt(state.downQty, 2)}</div>
            <div className="text-xs text-muted mt-0.5">≈ ${fmt(state.downQty * noPrice, 2)}</div>
          </div>

          {/* Trades */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4">
            <div className="text-xs text-muted mb-1">Trades</div>
            <div className="text-xl font-bold text-white tabular-nums">{state.nTrades}</div>
            <div className="text-xs text-muted mt-0.5">total buy + sell</div>
          </div>
        </div>

        {/* Trade panels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TradePanel
            dir="up" price={yesPrice}
            balance={state.balance} held={state.upQty}
            disabled={tradingDisabled}
            onBuy={qty => dispatch({ type: 'buy',  dir: 'up', qty, price: yesPrice })}
            onSell={qty => dispatch({ type: 'sell', dir: 'up', qty, price: yesPrice })}
          />
          <TradePanel
            dir="down" price={noPrice}
            balance={state.balance} held={state.downQty}
            disabled={tradingDisabled}
            onBuy={qty => dispatch({ type: 'buy',  dir: 'down', qty, price: noPrice })}
            onSell={qty => dispatch({ type: 'sell', dir: 'down', qty, price: noPrice })}
          />
        </div>
      </section>

    </div>
  )
}
