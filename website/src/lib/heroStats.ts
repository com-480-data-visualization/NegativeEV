/**
 * Typed loader for the hero stats JSON.
 *
 * Keeps the hero section presentational: it asks for stats once, gets a
 * fully-typed object, and forgets about fetch / parse details.
 */
import { useEffect, useState } from 'react'

export interface HeroStats {
  total_markets:     number
  total_volume_usd:  number
  days_of_data:      number
  up_rate:           number
  n_up:              number
  n_down:            number
  date_range: {
    start: string
    end:   string
    label: string
  }
}

export function useHeroStats(): HeroStats | null {
  const [stats, setStats] = useState<HeroStats | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/hero_stats.json')
      .then(r => r.json() as Promise<HeroStats>)
      .then(s => { if (!cancelled) setStats(s) })
    return () => { cancelled = true }
  }, [])

  return stats
}
