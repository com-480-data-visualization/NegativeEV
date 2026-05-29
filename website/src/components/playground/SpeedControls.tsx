// Right-side toolbar of the "Live market" sub-section: optional Restart
// button + Pause/Play + speed pills. All three controls live together so
// they share the same visual rhythm and the toolbar can be passed as a
// single `right={…}` prop to the SubSectionHeader.

// Multipliers exposed to the user. 1× = 1 tick/s; the larger values speed
// up playback proportionally.
const SPEED_OPTIONS = [1, 3, 6, 10, 20] as const

interface Props {
  speed: number
  paused: boolean
  canRestart: boolean
  onSpeedChange: (s: number) => void
  onTogglePause: () => void
  onRestart: () => void
}

export default function SpeedControls({
  speed, paused, canRestart,
  onSpeedChange, onTogglePause, onRestart,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {canRestart && (
        <button
          type="button"
          onClick={onRestart}
          title="End this session and return to setup"
          aria-label="Restart session"
          // Amber outline + tinted fill so the button reads as "destructive
          // but reversible" (matches the verdict's amber off-baseline
          // accent) and stands out from the muted speed pills without
          // being alarming red.
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
        onClick={onTogglePause}
        aria-label={paused ? 'Resume' : 'Pause'}
        title={paused ? 'Resume' : 'Pause'}
        className="inline-flex items-center justify-center w-7 h-7 rounded bg-surface-elevated text-gray-200 hover:text-white hover:bg-accent transition-colors"
      >
        {paused ? (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
            <path d="M0 0 L10 6 L0 12 Z" />
          </svg>
        ) : (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
            <rect x="0" y="0" width="3" height="12" />
            <rect x="7" y="0" width="3" height="12" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-1">
        <span className="text-xs text-muted mr-1">Speed:</span>
        {SPEED_OPTIONS.map(s => (
          <button key={s} onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              speed === s ? 'bg-accent text-white' : 'bg-surface-elevated text-muted hover:text-white'
            }`}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
