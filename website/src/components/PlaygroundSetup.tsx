/**
 * Pre-game configuration overlay for the Playground. Rendered on top of
 * the blurred playground preview before any session starts, and again
 * after the user clicks "Play again" on the summary screen.
 *
 * The mode type is exported from here (rather than from Playground.tsx)
 * to keep PlaygroundSetup and PlaygroundSummary free of any dependency
 * on Playground - they're standalone, presentational components.
 */
import { useState } from 'react'

export type PlaygroundMode = 'blind' | 'no-verdict' | 'full'

interface ModeOption {
  id: PlaygroundMode
  label: string
  subtitle: string
}

// Ordered from hardest to easiest so the natural eye scan (left to right)
// goes from "raw challenge" to "with safety net". Default lands on Full
// so first-time visitors get the pedagogical version.
const MODES: ModeOption[] = [
  {
    id: 'blind',
    label: 'Blind',
    subtitle: 'Live price and order book only. No calibration data.',
  },
  {
    id: 'no-verdict',
    label: 'No verdict',
    subtitle: 'Historical probabilities and gaps are visible. You pick the side.',
  },
  {
    id: 'full',
    label: 'Full',
    subtitle: "Full calibration panel, including the auto-verdict's follow / bet-against calls.",
  },
]

interface Props {
  maxAvailable: number     // capped at events.length, normally 50
  defaultMarkets?: number  // default = 20 (or clamped to maxAvailable)
  defaultMode?: PlaygroundMode
  onStart: (maxMarkets: number, mode: PlaygroundMode) => void
}

export default function PlaygroundSetup({
  maxAvailable,
  defaultMarkets = 20,
  defaultMode = 'full',
  onStart,
}: Props) {
  // Clamp defaults to the [5, maxAvailable] valid range so a small JSON
  // (e.g. 10 events shipped) never produces a slider stuck out of bounds.
  const initial = Math.min(Math.max(5, defaultMarkets), maxAvailable)
  const [markets, setMarkets] = useState(initial)
  const [mode, setMode] = useState<PlaygroundMode>(defaultMode)

  return (
    <div className="w-full max-w-md rounded-2xl border border-accent/40 bg-surface-elevated shadow-2xl p-6 sm:p-7">
      <div className="text-[10px] uppercase tracking-widest text-accent font-semibold mb-2">
        Setup
      </div>
      <h3 className="text-xl font-semibold text-white tracking-tight mb-1">
        Set up your session
      </h3>
      <p className="text-xs text-muted leading-relaxed mb-5">
        Choose how many real markets to replay and how much help you want from
        the calibration analysis.
      </p>

      {/* Number of markets slider */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs text-muted">Number of markets</span>
          <span className="text-xl font-bold text-white font-mono tabular-nums">
            {markets}
            <span className="text-xs text-muted font-normal"> / {maxAvailable}</span>
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={maxAvailable}
          step={1}
          value={markets}
          onChange={e => setMarkets(parseInt(e.target.value, 10))}
          className="w-full accent-accent"
        />
        <div className="flex items-baseline justify-between text-[10px] text-gray-500 mt-0.5">
          <span>5 markets</span>
          <span>{maxAvailable} markets</span>
        </div>
      </div>

      {/* Difficulty mode pills */}
      <div className="mb-6">
        <div className="text-xs text-muted mb-2">Difficulty mode</div>
        <div className="flex flex-col gap-2">
          {MODES.map(opt => {
            const active = mode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  active
                    ? 'border-accent/60 bg-accent/10 text-white'
                    : 'border-border bg-surface text-muted hover:text-white hover:border-border'
                }`}
              >
                <div className={`text-sm font-semibold ${active ? 'text-accent' : 'text-gray-200'}`}>
                  {opt.label}
                </div>
                <div className="text-[11px] text-muted mt-0.5 leading-snug">
                  {opt.subtitle}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onStart(markets, mode)}
        className="w-full rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-semibold py-2.5 transition-colors"
      >
        Start playing
      </button>
    </div>
  )
}
