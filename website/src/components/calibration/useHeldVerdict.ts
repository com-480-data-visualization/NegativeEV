// Smooths verdict flicker: returns either the raw verdict (when the action
// is stable across ticks) or a cached previous verdict (when a new action
// hasn't yet held for `holdSec` seconds). holdSec = 0 disables smoothing.
//
// State is held in a useRef so we don't re-render on cache writes:
//   - last       : verdict currently displayed (action label is compared
//                  against to detect a regime change).
//   - candidate  : alternative action seen recently and the timestamp when
//                  it first appeared. Cleared whenever we see the same
//                  action as `last`.
// When a candidate has been the raw action for at least holdSec seconds
// without interruption, we promote it: the candidate becomes the new `last`
// and the verdict refreshes in one go.
//
// Note: this mutates the ref during render. Intentional - it's the cheapest
// way to debounce without triggering extra renders.

import { useRef } from 'react'
import type { Verdict } from '../../lib/verdict'

interface HeldVerdictCache {
  last: Verdict
  candidate: { action: string; sinceMs: number } | null
}

export function useHeldVerdict(raw: Verdict, holdSec: number): Verdict {
  const cacheRef = useRef<HeldVerdictCache | null>(null)

  // First render or smoothing off: show the raw verdict immediately and
  // keep the cache in sync.
  if (cacheRef.current == null || holdSec <= 0) {
    cacheRef.current = { last: raw, candidate: null }
    return raw
  }

  const cache = cacheRef.current
  if (raw.action === cache.last.action) {
    // Same action as displayed: refresh numbers, clear any pending switch.
    cache.last = raw
    cache.candidate = null
    return raw
  }

  // Different action proposed.
  const nowMs = performance.now()
  if (cache.candidate?.action !== raw.action) {
    cache.candidate = { action: raw.action, sinceMs: nowMs }
  }
  const heldFor = nowMs - cache.candidate.sinceMs
  if (heldFor >= holdSec * 1000) {
    // Candidate has been stable long enough - commit the switch.
    cache.last = raw
    cache.candidate = null
    return raw
  }

  // Otherwise hold the previous verdict.
  return cache.last
}
