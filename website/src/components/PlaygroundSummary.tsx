/**
 * End-of-session summary overlay. Rendered on top of the blurred playground
 * once the user has played through all `maxMarkets` markets. Reports the
 * aggregate result and offers a single "Play again" CTA back to the setup
 * screen.
 *
 * Per-market history is intentionally not surfaced - we keep this card
 * small and emotional (one big PnL number) rather than a tabular debrief.
 */
import type { PlaygroundMode } from './PlaygroundSetup'

interface Props {
  startingBalance: number
  finalBalance: number
  marketsPlayed: number
  nTrades: number
  mode: PlaygroundMode
  onPlayAgain: () => void
}

const MODE_LABEL: Record<PlaygroundMode, string> = {
  blind: 'Blind',
  'no-verdict': 'No verdict',
  full: 'Full',
}

function fmtUSD(n: number) {
  const s = Math.abs(n).toFixed(2)
  return (n >= 0 ? '+$' : '-$') + s
}

// Short emotional reading of the result so the card doesn't feel cold.
// Calls out the mode in the loss case because Blind/No-verdict are
// genuinely harder than Full and the user might want to know that.
function interpretation(pnl: number, mode: PlaygroundMode): string {
  if (pnl > 0) return "You beat the do-nothing baseline. The crowd's blind spots paid out."
  if (pnl === 0) return 'Exactly break-even. The crowd matched its own price.'
  if (mode === 'blind') return 'Blind mode is hard. Try No verdict or Full to see what the calibration analysis would have flagged.'
  if (mode === 'no-verdict') return 'Close. Full mode adds an auto-verdict that spells out which side history favors.'
  return 'Sizing and timing matter as much as picking the side. Tweak Verdict tuning and try again.'
}

export default function PlaygroundSummary({
  startingBalance,
  finalBalance,
  marketsPlayed,
  nTrades,
  mode,
  onPlayAgain,
}: Props) {
  const pnl = finalBalance - startingBalance
  const pnlPct = startingBalance > 0 ? (pnl / startingBalance) * 100 : 0
  const pnlClass = pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-muted'

  return (
    <div className="w-full max-w-md rounded-2xl border border-accent/40 bg-surface-elevated shadow-2xl p-6 sm:p-7 text-center">
      <div className="text-[10px] uppercase tracking-widest text-accent font-semibold mb-2">
        Session complete
      </div>
      <h3 className="text-xl font-semibold text-white tracking-tight mb-5">
        How did you do?
      </h3>

      {/* Headline PnL number */}
      <div className={`text-5xl font-bold tabular-nums leading-none ${pnlClass}`}>
        {fmtUSD(pnl)}
      </div>
      <div className="text-xs text-muted mt-1.5">
        Final balance: <span className="text-white font-mono">${finalBalance.toFixed(2)}</span>
        {' '}<span className="text-gray-500">
          ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% from ${startingBalance})
        </span>
      </div>

      {/* Compact stats grid */}
      <div className="grid grid-cols-3 gap-2 mt-5 mb-5">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Markets</div>
          <div className="text-base font-semibold text-white tabular-nums">{marketsPlayed}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Mode</div>
          <div className="text-base font-semibold text-white">{MODE_LABEL[mode]}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Trades</div>
          <div className="text-base font-semibold text-white tabular-nums">{nTrades}</div>
        </div>
      </div>

      <p className="text-xs text-gray-300 leading-relaxed mb-5">
        {interpretation(pnl, mode)}
      </p>

      <button
        type="button"
        onClick={onPlayAgain}
        className="w-full rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-semibold py-2.5 transition-colors"
      >
        Play again
      </button>
    </div>
  )
}
