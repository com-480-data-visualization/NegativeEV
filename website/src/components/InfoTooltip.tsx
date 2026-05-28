import { useState } from 'react'

interface Props {
  text: string
  // Optional width override (default narrow popup that wraps to multi-line)
  width?: number
}

// Small "i" icon button with a popup that appears on hover (desktop) or
// click/focus (mobile / keyboard). Stays absolutely positioned so it never
// affects layout.
export default function InfoTooltip({ text, width = 240 }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <span className="group relative inline-flex align-middle ml-1.5">
      <button
        type="button"
        aria-label="More info"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted/40 text-[10px] font-semibold leading-none text-muted hover:text-white hover:border-accent focus:text-white focus:border-accent transition-colors"
      >
        i
      </button>

      <span
        role="tooltip"
        style={{ width }}
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs leading-relaxed text-gray-200 shadow-lg pointer-events-none transition-opacity ${
          open ? 'opacity-100' : 'opacity-0'
        } group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        {text}
      </span>
    </span>
  )
}
