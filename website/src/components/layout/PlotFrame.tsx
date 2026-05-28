/**
 * Iframe wrapper with a "loading…" overlay. Used for the calibration
 * surface, which is a pre-rendered ECharts 3D plot served as a static
 * HTML file.
 */
import { useState } from 'react'

interface Props {
  src:     string
  title:   string
  height?: number
}

export default function PlotFrame({ src, title, height = 680 }: Props) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      // Background matches the iframe's own page bg (#161922 =
      // var(--color-surface-elevated)) so the brief flash before the
      // iframe paints is invisible.
      className="relative rounded-2xl border border-border bg-surface-elevated overflow-hidden"
      style={{ height }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-sm">Loading interactive chart…</span>
        </div>
      )}
      <iframe
        src={src}
        title={title}
        className="w-full h-full border-0"
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.4s' }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
