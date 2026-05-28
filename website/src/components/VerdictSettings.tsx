// Settings panel that controls how the verdict reacts to the live data:
//   - edgeThresholdPp : min |Live − RealizedHist| in pp to flag an actionable trade
//   - minSamples      : min historical bucket samples required to trust the calibration
//   - kellyFraction   : 0 (off) | 0.25 | 0.5 | 1.0 — recommended bet size as a fraction of bankroll
//   - showVarianceBand: whether to surface the expected return ± 1σ range and P(profit ≥ 0)
//                       over the remaining markets in the session
//
// These are deliberately surfaced to the user because the EV is computed on
// the historical lookup (≈9k markets) whereas the simulator runs only 50
// — variance over such a small sample dominates the edge for small mispricings.

export interface VerdictSettings {
  edgeThresholdPp: number      // 0.5 – 10
  minSamples: number            // 30 – 500
  kellyFraction: number         // 0 | 0.25 | 0.5 | 1.0
  showVarianceBand: boolean
}

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive' | 'custom'

// Three presets that cover the realistic risk spectrum for the simulator.
//   Conservative : skeptical, fewer trades, no bet sizing advice
//   Balanced     : default, sensible threshold + half-Kelly sizing
//   Aggressive   : low threshold, full-Kelly sizing — for the maximalist trader
export const PROFILES: Record<Exclude<RiskProfile, 'custom'>, VerdictSettings> = {
  conservative: { edgeThresholdPp: 5, minSamples: 100, kellyFraction: 0,    showVarianceBand: true },
  balanced:     { edgeThresholdPp: 2, minSamples: 30,  kellyFraction: 0.5,  showVarianceBand: true },
  aggressive:   { edgeThresholdPp: 1, minSamples: 30,  kellyFraction: 1.0,  showVarianceBand: true },
}

export const DEFAULT_SETTINGS: VerdictSettings = PROFILES.balanced

// "Custom" if the current settings don't exactly match any preset.
export function detectProfile(s: VerdictSettings): RiskProfile {
  const entries = Object.entries(PROFILES) as [Exclude<RiskProfile, 'custom'>, VerdictSettings][]
  for (const [name, preset] of entries) {
    if (preset.edgeThresholdPp === s.edgeThresholdPp &&
        preset.minSamples === s.minSamples &&
        preset.kellyFraction === s.kellyFraction &&
        preset.showVarianceBand === s.showVarianceBand) {
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

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-xs text-muted">{children}</span>
      {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
    </div>
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
          edge ≥ {settings.edgeThresholdPp}pp · N ≥ {settings.minSamples} · {kellyLabel}{settings.showVarianceBand ? ' · variance' : ''}
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

          {/* Risk profile preset */}
          <div>
            <SectionLabel hint="snaps the 4 settings below to a preset">Risk profile</SectionLabel>
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
                <span className="text-xs text-muted">Edge threshold</span>
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
              <div className="text-[10px] text-gray-500 mt-0.5">Minimum live |L − R| to flag an actionable trade</div>
            </div>

            {/* Min samples slider */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted">Min samples</span>
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
              <div className="text-[10px] text-gray-500 mt-0.5">Minimum bucket size required to trust the calibration</div>
            </div>
          </div>

          {/* Kelly bet sizing */}
          <div>
            <SectionLabel hint="optimal bet as a fraction of your current bankroll">
              Kelly bet sizing
            </SectionLabel>
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
              Full Kelly maximizes long-run growth but is volatile; ½ Kelly is the common practical compromise.
            </div>
          </div>

          {/* Show variance band toggle */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showVarianceBand}
              onChange={e => onChange({ ...settings, showVarianceBand: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-accent"
            />
            <div className="flex-1">
              <div className="text-xs text-white">Show variance band</div>
              <div className="text-[10px] text-gray-500">
                Adds the expected ±1σ return range and probability of finishing profitable over the markets remaining in the session.
              </div>
            </div>
          </label>

        </div>
      )}
    </div>
  )
}
