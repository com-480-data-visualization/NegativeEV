// Settings panel that controls how the verdict switches between its two
// regimes and how aggressively it sizes the contrarian bet:
//   - edgeThresholdPp : |Live − RealizedHist| in pp at which we flip from
//                       "follow the live price" to "bet against the live
//                       price toward the historical baseline"
//   - minSamples      : min historical bucket samples required to trust
//                       the calibration lookup at all (else verdict = Wait)
//   - kellyFraction   : 0 (off) | 0.25 | 0.5 | 1.0 - bet size as a fraction
//                       of bankroll, only applied in the bet-against branch
//   - showVarianceBand: whether to surface the expected return ± 1σ range
//                       and P(profit ≥ 0) over the remaining markets
//   - verdictHoldSec  : 0-30 - dampens tick-by-tick verdict flicker. A new
//                       action only takes over after it has been raw for
//                       this many seconds in a row. Implemented in
//                       CalibrationPanel via a useRef cache; 0 = off.
//
// Every control gets a paired InfoTooltip ("i" popup) so a curious user
// can find out *why* the knob matters without needing the verdict body
// to be open. Inline helper text stays short and operational; the long
// "what it means in the two-regime model" copy lives in the tooltip.
//
// These are deliberately surfaced to the user because the EV is computed
// on the historical lookup (≈9k markets) whereas the simulator only runs
// 50 - variance over such a small sample dominates the expected return on
// thin divergences.

import InfoTooltip from './InfoTooltip'

export interface VerdictSettings {
  edgeThresholdPp: number      // 0.5 – 10
  minSamples: number            // 30 – 500
  kellyFraction: number         // 0 | 0.25 | 0.5 | 1.0
  showVarianceBand: boolean
  verdictHoldSec: number        // 0 – 30 (0 = no smoothing)
}

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive' | 'custom'

// Three presets that cover the realistic risk spectrum for the simulator.
// Each one bundles a regime-switch threshold, a Kelly aggressiveness, AND
// a verdict-hold duration consistent with the trader's temperament:
//   Conservative : skeptical, wide threshold, no Kelly, slow hold (10 s)
//   Balanced     : default, sensible threshold + half-Kelly, calm hold (5 s)
//   Aggressive   : tight threshold, full-Kelly, snappy hold (2 s)
export const PROFILES: Record<Exclude<RiskProfile, 'custom'>, VerdictSettings> = {
  conservative: { edgeThresholdPp: 5, minSamples: 100, kellyFraction: 0,    showVarianceBand: true, verdictHoldSec: 10 },
  balanced:     { edgeThresholdPp: 2, minSamples: 30,  kellyFraction: 0.5,  showVarianceBand: true, verdictHoldSec: 5  },
  aggressive:   { edgeThresholdPp: 1, minSamples: 30,  kellyFraction: 1.0,  showVarianceBand: true, verdictHoldSec: 2  },
}

export const DEFAULT_SETTINGS: VerdictSettings = PROFILES.balanced

// "Custom" if the current settings don't exactly match any preset.
export function detectProfile(s: VerdictSettings): RiskProfile {
  const entries = Object.entries(PROFILES) as [Exclude<RiskProfile, 'custom'>, VerdictSettings][]
  for (const [name, preset] of entries) {
    if (preset.edgeThresholdPp === s.edgeThresholdPp &&
        preset.minSamples === s.minSamples &&
        preset.kellyFraction === s.kellyFraction &&
        preset.showVarianceBand === s.showVarianceBand &&
        preset.verdictHoldSec === s.verdictHoldSec) {
      return name
    }
  }
  return 'custom'
}

// ── Small UI primitives ────────────────────────────────────────────────────
function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
        active
          ? 'border-accent/60 text-accent bg-accent/10'
          : 'border-border text-muted hover:text-white hover:border-border'
      }`}
    >
      {children}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
interface Props {
  settings: VerdictSettings
  onChange: (next: VerdictSettings) => void
  expanded: boolean
  onToggleExpanded: () => void
}

export default function VerdictSettingsPanel({ settings, onChange, expanded, onToggleExpanded }: Props) {
  const profile = detectProfile(settings)

  const kellyLabel = settings.kellyFraction === 0
    ? 'Kelly off'
    : settings.kellyFraction === 1 ? 'Full Kelly' : `${settings.kellyFraction}× Kelly`

  return (
    <div className="rounded-xl border border-border bg-surface-elevated">
      {/* Collapsed header bar */}
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.02] rounded-xl transition-colors"
      >
        {/* gear icon */}
        <svg viewBox="0 0 20 20" fill="currentColor" className="shrink-0 w-4 h-4 text-muted" aria-hidden="true">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
        <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">Verdict tuning</span>
        <span className="text-xs text-gray-300 shrink-0">
          Profile: <span className="text-white font-medium capitalize">{profile}</span>
        </span>
        <span className="text-[11px] text-muted truncate ml-auto font-mono">
          gap ≥ {settings.edgeThresholdPp}pp · N ≥ {settings.minSamples} · {kellyLabel}{settings.verdictHoldSec > 0 ? ` · hold ${settings.verdictHoldSec}s` : ''}{settings.showVarianceBand ? ' · variance' : ''}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`shrink-0 w-4 h-4 text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanded controls */}
      {expanded && (
        <div className="border-t border-border/40 p-4 space-y-4">

          {/* One-liner reminder so the user lands on the two-regime model
              before touching any knob. */}
          <p className="text-[11px] leading-relaxed text-gray-400">
            The verdict runs in two modes: <span className="text-white">follow the market</span> when the
            live price agrees with the baseline, and <span className="text-white">bet against it</span> when
            it diverges. The controls below set <em>when</em> we switch and <em>how large</em> the
            contrarian bet is.
          </p>

          {/* Risk profile preset */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs text-muted inline-flex items-center">
                Risk profile
                <InfoTooltip
                  width={280}
                  text="Quick-select presets. Conservative: 5 pp gap, no Kelly, 100+ samples. Balanced (default): 2 pp gap, half-Kelly. Aggressive: 1 pp gap, full Kelly. All presets shape only the bet-against branch; the follow-market branch is unaffected."
                />
              </span>
              <span className="text-[10px] text-gray-500">applies to all 4 settings</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['conservative', 'balanced', 'aggressive'] as const).map(p => (
                <PillButton key={p} active={profile === p} onClick={() => onChange(PROFILES[p])}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </PillButton>
              ))}
              {profile === 'custom' && (
                <span className="px-3 py-1.5 rounded-md text-xs font-medium border border-accent/60 text-accent bg-accent/10">
                  Custom
                </span>
              )}
            </div>
          </div>

          {/* Two columns on wider screens for compactness */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Edge threshold slider */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted inline-flex items-center">
                  Edge threshold
                  <InfoTooltip
                    width={300}
                    text="The gap |Live − Realized Historical| that triggers the mode switch. Below it, the live price agrees with the baseline and the verdict says to follow it. Above it, the price is off-baseline and we bet toward history instead. Lower = more contrarian signals; higher = fewer, higher-confidence ones."
                  />
                </span>
                <span className="text-xs text-white font-mono tabular-nums">{settings.edgeThresholdPp.toFixed(1)} pp</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.5}
                value={settings.edgeThresholdPp}
                onChange={e => onChange({ ...settings, edgeThresholdPp: parseFloat(e.target.value) })}
                className="w-full accent-accent"
              />
              <div className="text-[10px] text-gray-500 mt-0.5">Above this threshold the verdict flips to bet-against. Below it, follow the market.</div>
            </div>

            {/* Min samples slider */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted inline-flex items-center">
                  Min samples
                  <InfoTooltip
                    width={300}
                    text="Minimum historical markets in the current (time, BTC move) bucket before we trust the calibration lookup. Below this the verdict returns Wait. 30 is the dataset's built-in floor; raising it removes noisy estimates from sparse cells at the cost of more Wait verdicts."
                  />
                </span>
                <span className="text-xs text-white font-mono tabular-nums">{settings.minSamples}</span>
              </div>
              <input
                type="range"
                min={30}
                max={500}
                step={10}
                value={settings.minSamples}
                onChange={e => onChange({ ...settings, minSamples: parseInt(e.target.value, 10) })}
                className="w-full accent-accent"
              />
              <div className="text-[10px] text-gray-500 mt-0.5">Below this bucket size the verdict says Wait instead of trading.</div>
            </div>
          </div>

          {/* Verdict hold slider. Full-width row because it's conceptually
              an UX-smoothing knob, not a regime-tuning knob. */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-muted inline-flex items-center">
                Verdict hold
                <InfoTooltip
                  width={320}
                    text="Holds the current verdict for at least this long before switching to a new action; this smooths flicker when the live price hovers near the edge threshold. A new action must hold steady for this many seconds before it takes over. Set to 0 for instant updates."
                />
              </span>
              <span className="text-xs text-white font-mono tabular-nums">
                {settings.verdictHoldSec === 0 ? 'off' : `${settings.verdictHoldSec} s`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={settings.verdictHoldSec}
              onChange={e => onChange({ ...settings, verdictHoldSec: parseInt(e.target.value, 10) })}
              className="w-full accent-accent"
            />
            <div className="text-[10px] text-gray-500 mt-0.5">
              Higher = fewer updates, more stable display. Lower = instant reactions but flickery near the threshold.
            </div>
          </div>

          {/* Kelly bet sizing */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs text-muted inline-flex items-center">
                Kelly bet sizing
                <InfoTooltip
                  width={320}
                    text="Stake size as a fraction of your bankroll, shown only in the bet-against branch (calibrated rounds have ~0 EV so the optimal Kelly stake is zero). Full Kelly maximises expected log-growth but is volatile on small samples. ¼ or ½ Kelly trade some growth for stability. Off hides the dollar amount but keeps the EV display."
                />
              </span>
              <span className="text-[10px] text-gray-500">fraction of bankroll, contrarian bets only</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 0,    label: 'Off' },
                { value: 0.25, label: '¼ Kelly' },
                { value: 0.5,  label: '½ Kelly' },
                { value: 1.0,  label: 'Full Kelly' },
              ].map(({ value, label }) => (
                <PillButton
                  key={value}
                  active={settings.kellyFraction === value}
                  onClick={() => onChange({ ...settings, kellyFraction: value })}
                >
                  {label}
                </PillButton>
              ))}
            </div>
            <div className="text-[10px] text-gray-500 mt-1.5">
              Full Kelly maximises long-run growth but is volatile; ½ Kelly is the common practical compromise.
            </div>
          </div>

          {/* Show variance band toggle. The label is split from the
              InfoTooltip so clicking "i" doesn't also flip the checkbox. */}
          <div className="flex items-start gap-2">
            <input
              id="show-variance-band"
              type="checkbox"
              checked={settings.showVarianceBand}
              onChange={e => onChange({ ...settings, showVarianceBand: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-accent cursor-pointer"
            />
            <div className="flex-1">
              <div className="inline-flex items-center text-xs text-white">
                <label htmlFor="show-variance-band" className="cursor-pointer">
                  Show variance band
                </label>
                <InfoTooltip
                  width={320}
                    text="Adds a μ ± σ range and P(profit ≥ 0) to the bet-against verdict, computed over the remaining markets (≤50). On small N, variance often swamps the expected return; this surfaces cases where the edge is positive but P(profit) is close to 50/50."
                />
              </div>
              <div className="text-[10px] text-gray-500">
                Shows the ±1σ return range and P(profit) over the remaining markets.
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
