import { useEffect, useReducer, useState } from 'react'
import PriceChart from './PriceChart'

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
  phase: 'loading', resolution: null,
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2) { return n.toFixed(d) }
function fmtUSD(n: number) {
  const s = Math.abs(n).toFixed(2)
  return (n >= 0 ? '+$' : '-$') + s
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
      <div className="text-xs text-muted">Held: <span className="text-white">{fmt(held, 2)}</span> tokens</div>

      {/* Quantity input + quick presets */}
      <div className="flex gap-2">
        <input
          type="number" min="0" step="1" placeholder="Qty"
          value={qty} onChange={e => setQty(e.target.value)}
          disabled={disabled}
          className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent disabled:opacity-40"
        />
        {[1, 10, 100].map(n => (
          <button key={n} onClick={() => setQty(String(n))} disabled={disabled}
            className="px-2 py-1 rounded-lg border border-border bg-surface text-xs text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-30 shrink-0">
            {n}
          </button>
        ))}
      </div>

      {valid && (
        <div className="text-xs text-muted">
          Cost: <span className="text-white">${fmt(cost, 2)}</span>
          {' · '}Receive: <span className="text-white">${fmt(parsed * price, 2)}</span>
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

  // Load events
  useEffect(() => {
    fetch('/data/playground_events.json')
      .then(r => r.json())
      .then(p => dispatch({ type: 'init', events: p.events }))
      .catch(e => console.error('Failed to load playground events', e))
  }, [])

  // Tick timer
  useEffect(() => {
    if (state.phase !== 'playing') return
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000 / speed)
    return () => clearInterval(id)
  }, [state.phase, state.gameIdx, speed])

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

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Balance */}
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <div className="text-xs text-muted mb-1">Balance</div>
          <div className="text-xl font-bold text-white">${fmt(state.balance, 2)}</div>
          <div className={`text-xs font-medium mt-0.5 ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtUSD(pnl)} P&L
          </div>
        </div>

        {/* UP tokens */}
        <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
          <div className="text-xs text-muted mb-1">↑ UP tokens</div>
          <div className="text-xl font-bold text-white">{fmt(state.upQty, 2)}</div>
          <div className="text-xs text-muted mt-0.5">≈ ${fmt(state.upQty * yesPrice, 2)}</div>
        </div>

        {/* DOWN tokens */}
        <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
          <div className="text-xs text-muted mb-1">↓ DOWN tokens</div>
          <div className="text-xl font-bold text-white">{fmt(state.downQty, 2)}</div>
          <div className="text-xs text-muted mt-0.5">≈ ${fmt(state.downQty * noPrice, 2)}</div>
        </div>

        {/* Market info */}
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <div className="text-xs text-muted mb-1">Time remaining</div>
          <div className="text-xl font-bold text-white font-mono">{mm}:{ss}</div>
          <div className="text-xs text-muted mt-0.5">
            Market {state.gameIdx + 1} / {state.events.length}
          </div>
        </div>
      </div>

      {/* ── BTC price info ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-1 text-sm text-muted">
        <span>BTC <span className="text-white font-mono">${btcPrice.toLocaleString('en', { maximumFractionDigits: 2 })}</span></span>
        {event && (
          <span className="text-xs text-muted/60 truncate">{event.slug}</span>
        )}
        {/* Speed control */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs mr-1">Speed:</span>
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

      {/* ── Live chart ──────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-border bg-surface-elevated px-4 pt-4 pb-2">
        {event && (
          <PriceChart seconds={event.seconds} currentSecond={state.tick} />
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

      {/* ── Trade panels ────────────────────────────────────────────────────── */}
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

    </div>
  )
}
