/**
 * Scroll-spy hook.
 *
 * Observes a list of section ids via a single IntersectionObserver and
 * returns the id of the section closest to the top of the viewport.
 *
 * Why a single observer: cheaper than one per section, and lets us pick
 * the "best" candidate when several sections overlap the rootMargin band
 * during fast scrolls.
 */
import { useEffect, useState } from 'react'

/**
 * @param ids   Section element ids, in document order.
 * @param topOffsetPx Pixels from the top of the viewport that count as "active".
 *                    Roughly equal to the sticky-nav height.
 */
export function useScrollSpy(ids: string[], topOffsetPx = 96): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)

  useEffect(() => {
    if (typeof window === 'undefined' || ids.length === 0) return

    const elements = ids
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    // We mark a section "active" once its top crosses topOffsetPx from the
    // viewport top; the rootMargin shifts the observer's reference line up.
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActive(visible[0].target.id)
        }
      },
      {
        rootMargin: `-${topOffsetPx}px 0px -55% 0px`,
        threshold: 0,
      },
    )

    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [ids, topOffsetPx])

  return active
}
