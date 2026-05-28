/**
 * Two-tone gauge showing the historical UP / DOWN outcome split.
 *
 * The card-style layout puts the two percentages front and centre with their
 * win counts as supporting detail, and renders a thick split bar with a
 * 50% reference tick so the eye immediately picks up any deviation from a
 * fair-coin baseline.
 *
 * Animation: the bar grows from a collapsed 50/50 baseline to the target on
 * mount; if the parent later updates `upRate`, we ease from the previous
 * displayed value to the new target. RAF is cleaned up on unmount.
 */
import { useEffect, useState } from 'react'

interface Props {
  /** UP probability in [0, 1]. */
  upRate:     number
  /** Optional UP / DOWN counts, shown as supporting detail under the percentages. */
  nUp?:       number
  nDown?:     number
  /** Optional grow-in animation duration in ms. 0 disables the animation. */
  animateMs?: number
}

const GREEN = '#22c55e'
const RED   = '#ef4444'

export default function HeroGauge({ upRate, nUp, nDown, animateMs = 900 }: Props) {
  const [displayed, setDisplayed] = useState(animateMs > 0 ? 0.5 : upRate)

  useEffect(() => {
    if (animateMs <= 0) {
      setDisplayed(upRate)
      return
    }
    const start = performance.now()
    const from  = displayed
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min((now - start) / animateMs, 1)
      const e = 1 - Math.pow(1 - t, 3)
      setDisplayed(from + (upRate - from) * e)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // displayed intentionally omitted: we only re-animate when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upRate, animateMs])

  const upPct   = displayed * 100
  const downPct = 100 - upPct

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-400/15 text-green-400 text-base">↑</span>
          <div>
            <div className="text-3xl sm:text-4xl font-bold text-green-400 tabular-nums leading-none">
              {upPct.toFixed(1)}%
            </div>
            <div className="text-[0.7rem] uppercase tracking-widest text-muted mt-1">
              UP{nUp !== undefined ? ` · ${nUp.toLocaleString()} wins` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-baseline gap-3 text-right">
          <div>
            <div className="text-3xl sm:text-4xl font-bold text-red-400 tabular-nums leading-none">
              {downPct.toFixed(1)}%
            </div>
            <div className="text-[0.7rem] uppercase tracking-widest text-muted mt-1">
              DOWN{nDown !== undefined ? ` · ${nDown.toLocaleString()} wins` : ''}
            </div>
          </div>
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-400/15 text-red-400 text-base">↓</span>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="relative h-4 w-full rounded-full overflow-hidden border border-border"
          style={{ background: 'rgba(15, 17, 23, 0.6)' }}
        >
          <div
            className="absolute left-0 top-0 h-full transition-[width] duration-200"
            style={{
              width: `${upPct}%`,
              background: `linear-gradient(90deg, ${GREEN}cc, ${GREEN})`,
            }}
          />
          <div
            className="absolute right-0 top-0 h-full transition-[width] duration-200"
            style={{
              width: `${downPct}%`,
              background: `linear-gradient(270deg, ${RED}cc, ${RED})`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
