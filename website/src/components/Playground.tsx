import { useEffect, useMemo, useReducer, useState } from 'react'
import PriceChart, { type HistoricalSeries } from './PriceChart'
import CalibrationPanel from './CalibrationPanel'
import PlaygroundSetup from './PlaygroundSetup'
import PlaygroundSummary from './PlaygroundSummary'
import { lookupCalibration, type CalibrationLookup } from '../lib/calibration'
import { INITIAL, reducer, SESSION_MAX, STARTING_BALANCE } from './playground/reducer'
import { fmt, fmtUSD } from './playground/format'
import SessionOverlay from './playground/SessionOverlay'
import SpeedControls from './playground/SpeedControls'
import SubSectionHeader from './playground/SubSectionHeader'
import TradePanel from './playground/TradePanel'

const RESOLUTION_AUTOADVANCE_MS = 3500

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

  // Tick timer. `state.gameIdx` is in the deps so the interval re-arms
  // between markets (the previous one's interval is cleared, even when the
  // phase happens to be 'playing' at both moments).
  useEffect(() => {
    if (state.phase !== 'playing' || paused) return
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000 / speed)
    return () => clearInterval(id)
  }, [state.phase, state.gameIdx, speed, paused])

  // Auto-advance after resolution
  useEffect(() => {
    if (state.phase !== 'resolved') return
    const id = setTimeout(() => dispatch({ type: 'next_market' }), RESOLUTION_AUTOADVANCE_MS)
    return () => clearTimeout(id)
  }, [state.phase, state.gameIdx])

  const event = state.events[state.gameIdx]
  const data  = event?.seconds[state.tick]

  const yesPrice = data?.yes_price ?? 0.5
  const noPrice  = data?.no_price  ?? 0.5
  const btcPrice = data?.btc_price ?? 0

  // Portfolio value including open token positions
  const portfolioValue = state.balance + state.upQty * yesPrice + state.downQty * noPrice
  const pnl = portfolioValue - STARTING_BALANCE

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
        <SubSectionHeader
          title="Live market"
          right={
            <SpeedControls
              speed={speed}
              paused={paused}
              canRestart={canRestart}
              onSpeedChange={setSpeed}
              onTogglePause={() => setPaused(p => !p)}
              onRestart={() => dispatch({ type: 'restart_to_config' })}
            />
          }
        />

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

      {/* Setup-before-play / summary-after gating overlay */}
      {isOverlay && (
        <SessionOverlay>
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
        </SessionOverlay>
      )}
    </div>
  )
}
