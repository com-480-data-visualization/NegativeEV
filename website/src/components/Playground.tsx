import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import PriceChart, { type HistoricalSeries } from './PriceChart'
import CalibrationPanel from './CalibrationPanel'
import InfoTooltip from './InfoTooltip'
import PlaygroundSetup, { type PlaygroundMode } from './PlaygroundSetup'
import PlaygroundSummary from './PlaygroundSummary'
import { lookupCalibration, type CalibrationLookup } from '../lib/calibration'

// Hard cap on the number of markets a single session can replay (matches
// the slider's upper bound). The actual cap is min(this, events.length).
const SESSION_MAX = 50
const STARTING_BALANCE = 100

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
  nTrades: number       // cumulative buy + sell count over the current session
  // Session lifecycle:
  //   loading  - waiting for the JSON to come back
  //   config   - events loaded, user has not started a session yet (or just
  //              clicked Restart / Play again). Setup overlay is on top.
  //   playing  - active round, tick timer is running
  //   resolved - round just ended, 3.5 s win/lose overlay before auto-advance
  //   finished - the last round of the session has resolved. Summary
  //              overlay is on top, content behind it is blurred
  phase: 'loading' | 'config' | 'playing' | 'resolved' | 'finished'
  resolution: Resolution | null
  // Session parameters chosen on the setup screen.
  maxMarkets: number             // 5–SESSION_MAX (capped by events.length)
  mode: PlaygroundMode           // blind / no-verdict / full
}

type Action =
  | { type: 'init'; events: EventData[] }
  | { type: 'tick' }
  | { type: 'buy'; dir: 'up' | 'down'; qty: number; price: number }
  | { type: 'sell'; dir: 'up' | 'down'; qty: number; price: number }
  | { type: 'next_market' }
  | { type: 'start_session'; maxMarkets: number; mode: PlaygroundMode }
  | { type: 'restart_to_config' }

// Fisher-Yates: returns a freshly shuffled COPY so the original array
// (and any external reference to it) stays untouched. Used by
// `start_session` to randomise the play order every run.
function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {

    case 'init':
      // Loaded events arrive: drop the user on the setup screen. We don't
      // auto-start; the user picks the count and difficulty mode first.
      return { ...state, events: action.events, phase: 'config' }

    case 'tick': {
      if (state.phase !== 'playing') return state
      const next = state.tick + 1
      if (next > 299) {
        // Market over - resolve outcome from actual price movement
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

    case 'next_market': {
      // End of the bounded session: stop instead of looping back to idx 0.
      // The summary overlay reads balance / nTrades / maxMarkets / mode
      // from this same state, so we don't reset anything here.
      const nextIdx = state.gameIdx + 1
      if (nextIdx >= state.maxMarkets || nextIdx >= state.events.length) {
        return { ...state, phase: 'finished', resolution: null }
      }
      return {
        ...state,
        gameIdx: nextIdx,
        tick: 0,
        phase: 'playing',
        resolution: null,
      }
    }

    case 'start_session':
      // Wipes prior session state (balance / qty / trades) so each run
      // starts clean, and pins the chosen difficulty for the duration.
      // The events pool is reshuffled here so two consecutive sessions
      // never replay the same markets in the same order - keeps the
      // experience fresh on Play again / Restart.
      return {
        ...state,
        events: shuffled(state.events),
        gameIdx: 0,
        tick: 0,
        balance: STARTING_BALANCE,
        upQty: 0,
        downQty: 0,
        nTrades: 0,
        resolution: null,
        phase: 'playing',
        maxMarkets: action.maxMarkets,
        mode: action.mode,
      }

    case 'restart_to_config':
      // Same wipe as start_session but lands on the config screen instead
      // of playing. We keep `maxMarkets` and `mode` so the setup card
      // remembers the user's last choice without forcing them to re-pick.
      return {
        ...state,
        gameIdx: 0,
        tick: 0,
        balance: STARTING_BALANCE,
        upQty: 0,
        downQty: 0,
        nTrades: 0,
        resolution: null,
        phase: 'config',
      }

    default:
      return state
  }
}

const INITIAL: GameState = {
  events: [], gameIdx: 0, tick: 0,
  balance: STARTING_BALANCE, upQty: 0, downQty: 0,
  nTrades: 0,
  phase: 'loading', resolution: null,
  // Default session: 20 markets, full insight. Same defaults the setup
  // card lands on - so a user who clicks Start without touching the
  // controls gets the pedagogical version.
  maxMarkets: 20, mode: 'full',
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
    if (!canBuy) { flash(cost > balance ? 'Not enough balance' : 'Enter a valid quantity'); return }
    onBuy(parsed); setQty(''); flash(`Bought ${fmt(parsed, 1)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }
  const handleSell = () => {
    if (!canSell) { flash(parsed > held ? `You only hold ${fmt(held, 2)} tokens` : 'Enter a valid quantity'); return }
    onSell(parsed); setQty(''); flash(`Sold ${fmt(parsed, 1)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }
  const handleSellAll = () => {
    if (held <= 0) { flash('No tokens held'); return }
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
  const isPlaying  = state.phase === 'playing'
  // Trading is allowed only during an active round. The blurred preview
  // frames (config / finished) sit behind a pointer-events-none overlay,
  // but we belt-and-suspender the trade panel disabling too.
  const tradingDisabled = !isPlaying

  const timeRemaining = data?.time_remaining ?? 300
  const mm = String(Math.floor(timeRemaining / 60)).padStart(2, '0')
  const ss = String(timeRemaining % 60).padStart(2, '0')

  // Live calibration readout: P(UP | T, ΔBTC) from historical data,
  // both market-implied and realized - see scripts/export_calibration_lookup.py.
  const btcPctChange = data?.btc_pct_change ?? 0
  const calibPoint = useMemo(() => {
    if (!calibration) return null
    return lookupCalibration(calibration, timeRemaining, btcPctChange)
  }, [calibration, timeRemaining, btcPctChange])

  // Precompute the historical series (implied + realized) for every second of
  // the current market. Recomputed only when the market or lookup changes -
  // not on every tick - so it scales well.
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

  // Restart button is only meaningful while a session is in flight - we
  // hide it on the config and finished screens (the user has a dedicated
  // primary CTA there). Dispatched action wipes the session state but
  // preserves the previously chosen mode/maxMarkets so the setup card
  // stays on whatever the user picked last.
  const canRestart = isPlaying || isResolved
  const speedControls = (
    <div className="flex items-center gap-2">
      {canRestart && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'restart_to_config' })}
          title="End this session and return to setup"
          aria-label="Restart session"
          // Amber outline + tinted fill so the button reads as
          // "destructive but reversible" (matches the verdict's amber
          // off-baseline accent) and stands out from the muted speed
          // pills without being alarming red.
          className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded border border-amber-400/50 bg-amber-400/10 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 hover:text-amber-200 hover:border-amber-400/70 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 8a6 6 0 1 1 1.8 4.3" />
            <path d="M2 14v-4h4" />
          </svg>
          Restart
        </button>
      )}
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
        {[1, 3, 6, 10, 20].map(s => (
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

  // Phase-driven overlay state. In config/finished we render the playground
  // content normally (so the blur reads as "this is what's waiting for you")
  // but layer it under a backdrop-blur overlay holding the setup or summary
  // card. Pointer-events are killed on the underlying content so the user
  // can't sneak trades in from behind the blur.
  const isConfig   = state.phase === 'config'
  const isFinished = state.phase === 'finished'
  const isOverlay  = isConfig || isFinished

  // Cap the slider's upper bound at whatever ships in the JSON (normally
  // 50). Avoids a slider that lets the user pick more markets than exist.
  const maxAvailable = Math.min(SESSION_MAX, state.events.length)

  // Calibration insight is gated by difficulty. In "blind" the entire
  // section is dropped from the layout (no header, no card). In
  // "no-verdict" the section is shown but the verdict + tuning panel
  // inside it are hidden (probability + gap cards stay visible).
  const showInsightSection = state.mode !== 'blind'
  const showVerdict        = state.mode === 'full'

  return (
    <div className="relative">
      <div className={`flex flex-col gap-8 ${isOverlay ? 'pointer-events-none select-none' : ''}`}>

      {/* ── 1. Historical Prediction Insight ─────────────────────────────── */}
      {showInsightSection && (
        <section>
          <SubSectionHeader
            title="Historical Prediction Insight"
            tooltip="Live calibration readout from 9,181 historical BTC five-minute markets. When the live price agrees with the historical baseline, the price is a reliable guide. When it disagrees, the panel shows which side history favors."
          />
          {calibPoint
            ? (
              <CalibrationPanel
                point={calibPoint}
                liveImplied={yesPrice}
                upQty={state.upQty}
                downQty={state.downQty}
                balance={state.balance}
                remainingMarkets={Math.max(0, state.maxMarkets - state.gameIdx)}
                showVerdict={showVerdict}
              />
            )
            : (
              <div className="rounded-xl border border-border bg-surface-elevated p-4 text-sm text-muted">
                Loading historical calibration data…
              </div>
            )
          }
        </section>
      )}

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
            <div className="text-xs text-muted mt-0.5">until close</div>
          </div>

          {/* Market progress + slug (merged) */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4 min-w-0">
            <div className="text-xs text-muted mb-1">Market</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {state.gameIdx + 1}
              <span className="text-muted text-base font-normal"> / {state.maxMarkets}</span>
            </div>
            <div className="text-xs text-muted mt-0.5 font-mono truncate" title={event?.slug}>
              {event?.slug ?? '-'}
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
                    {fmt(state.resolution.loseTokens, 2)} losing tokens expire at $0
                  </div>
                )}
                <div className="text-muted text-sm mt-3 animate-pulse">Loading next market…</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 3. Wallet & trading (wallet strip + trade panels) ─────────────── */}
      <section>
        <SubSectionHeader
          title="Your wallet & trading account"
          tooltip="Your live balance and open positions. Buy or sell tokens at the current market price. Trading closes once the round resolves."
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
            <div className="text-xs text-muted mt-0.5">buys + sells this session</div>
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

      {/* ── Gating overlay (setup before play, summary after) ──────────────
          Split into two stacked layers so we can fully blur the
          playground AND get a soft, fluffy outer edge:
            • Layer 1 (z-10): backdrop-blur + tint, intentionally sized
              MUCH LARGER than the playground via a negative inset. The
              mask gradient feathers the alpha to 0 well outside the
              playground bounds, so what the user sees inside the
              playground rectangle is the fully opaque middle of the
              mask (= fully blurred), and only the halo outside the
              playground softly dissolves into the page.
            • Layer 2 (z-20): a transparent flex container holding the
              setup or summary card. No mask, no blur, so the card is
              always crisp regardless of where the backdrop is fading. */}
      {isOverlay && (
        <>
          <div
            aria-hidden
            className="absolute z-10 backdrop-blur-lg bg-surface/60 pointer-events-none"
            style={{
              // Asymmetric extension constrained on the top and bottom
              // so the blur never bleeds onto the SectionHeader above
              // (only 2 rem of breathing room there) or the Footer
              // below (the parent section's `pb-28` = 7 rem gives us a
              // 5 rem safety belt to spend). Sides stay generous so the
              // horizontal halo still feels soft.
              top:    '-1.5rem',
              right:  '-14rem',
              bottom: '-5rem',
              left:   '-14rem',
              // Vertical mask: tight 2 % top fade and 5 % bottom fade
              // so both fade regions live entirely inside their (small)
              // extensions and don't dim the playground content itself.
              // Horizontal mask: symmetric 12 % fade on each side -
              // those still have 14 rem of runway, so the soft halo
              // shows up where you can afford it. Composited with
              // `intersect` to form the rectangular vignette. Both
              // unprefixed and -webkit- properties are set for Safari.
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, #000 2%, #000 95%, transparent 100%), linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)',
              WebkitMaskComposite: 'source-in',
              maskImage:
                'linear-gradient(to bottom, transparent 0%, #000 2%, #000 95%, transparent 100%), linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)',
              maskComposite: 'intersect',
            }}
          />
          <div
            className="absolute inset-0 z-20 flex items-start justify-center px-4 pt-12 sm:pt-20"
            aria-modal="true"
            role="dialog"
          >
            {isConfig && (
              <PlaygroundSetup
                maxAvailable={maxAvailable}
                defaultMarkets={state.maxMarkets}
                defaultMode={state.mode}
                onStart={(maxMarkets, mode) =>
                  dispatch({ type: 'start_session', maxMarkets, mode })
                }
              />
            )}
            {isFinished && (
              <PlaygroundSummary
                startingBalance={STARTING_BALANCE}
                finalBalance={state.balance}
                marketsPlayed={state.maxMarkets}
                nTrades={state.nTrades}
                mode={state.mode}
                onPlayAgain={() => dispatch({ type: 'restart_to_config' })}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
