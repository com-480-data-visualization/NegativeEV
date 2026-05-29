// Gating overlay that sits on top of the blurred playground while a
// session hasn't started (config screen) or has just finished (summary
// screen). Splits into two stacked layers:
//   - Layer 1 (z-10): backdrop-blur + tint, intentionally extending well
//     past the playground bounds. The mask gradient feathers the alpha
//     to 0 outside the playground rectangle, so the visible interior is
//     the fully opaque middle of the mask (= fully blurred) and only the
//     halo softly dissolves into the page.
//   - Layer 2 (z-20): transparent flex container holding the setup or
//     summary card. No mask, no blur, so the card stays crisp regardless
//     of where the backdrop is fading.

import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

// Mask gradients (vertical + horizontal). The pair is composed with
// `mask-composite: intersect` to form a rectangular vignette.
const MASK_GRADIENT =
  'linear-gradient(to bottom, transparent 0%, #000 2%, #000 95%, transparent 100%), '
  + 'linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)'

export default function SessionOverlay({ children }: Props) {
  return (
    <>
      <div
        aria-hidden
        className="absolute z-10 backdrop-blur-lg bg-surface/60 pointer-events-none"
        style={{
          // Asymmetric extension constrained on the top and bottom so the
          // blur never bleeds onto the SectionHeader above (only 2 rem of
          // breathing room there) or the Footer below (the parent
          // section's `pb-28` = 7 rem gives us a 5 rem safety belt to
          // spend). Sides stay generous so the horizontal halo still
          // feels soft.
          top:    '-1.5rem',
          right:  '-14rem',
          bottom: '-5rem',
          left:   '-14rem',
          // Vertical mask: tight 2% top fade and 5% bottom fade so both
          // fade regions live entirely inside their (small) extensions
          // and don't dim the playground content itself. Horizontal
          // mask: symmetric 12% fade on each side - those still have
          // 14 rem of runway, so the soft halo shows up where you can
          // afford it. Both unprefixed and -webkit- properties are set
          // for Safari.
          WebkitMaskImage: MASK_GRADIENT,
          WebkitMaskComposite: 'source-in',
          maskImage: MASK_GRADIENT,
          maskComposite: 'intersect',
        }}
      />
      <div
        className="absolute inset-0 z-20 flex items-start justify-center px-4 pt-12 sm:pt-20"
        aria-modal="true"
        role="dialog"
      >
        {children}
      </div>
    </>
  )
}
