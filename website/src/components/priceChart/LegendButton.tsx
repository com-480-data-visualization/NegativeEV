// Single toggle pill in the price-chart legend (one per visible series).
//
// MUST live at module scope (not nested inside PriceChart) - defining
// it in the component body would create a fresh function reference on
// every tick, which React treats as a different component type and
// unmount/remount-s each button, causing visible blinks and a brief
// un-clickable window.

import type { ReactNode } from 'react'

interface Props {
  active: boolean
  onClick: () => void
  disabled?: boolean
  swatchColor: string
  dashed?: boolean
  children: ReactNode
}

export default function LegendButton({
  active, onClick, disabled, swatchColor, dashed, children,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all ${
        active
          ? 'border-border bg-surface text-gray-200 hover:border-accent'
          : 'border-border/40 bg-transparent text-muted opacity-50 hover:opacity-80'
      } disabled:cursor-not-allowed disabled:hover:border-border`}
    >
      {dashed ? (
        <svg width="14" height="2" className="inline-block">
          <line x1="0" y1="1" x2="14" y2="1" stroke={swatchColor} strokeWidth="2" strokeDasharray="4 2" />
        </svg>
      ) : (
        <span className="inline-block w-[14px] h-[2px]" style={{ background: swatchColor }} />
      )}
      {children}
    </button>
  )
}
