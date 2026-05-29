// Reusable gap/probability card styling for the calibration panel.
//
// Three tinted-card styles + the GapCard component used to render the
// "Live vs Hist Implied", "Live vs Hist Realized" and "Hist Calibration
// Gap" tiles. Live/historical *probability* tints (probTintStyle) and
// the verdict bar tints (verdictStyle) live here too, so the whole
// colour vocabulary for the calibration block sits in one file.

import InfoTooltip from '../InfoTooltip'
import type { Verdict } from '../../lib/verdict'

// |gap| below this threshold (in raw probability units, e.g. 0.02 = 2 pp)
// is treated as "neutral / well calibrated". The reality / historical gap
// thresholds are now user-controlled via VerdictSettings.edgeThresholdPp;
// `GAP_NEUTRAL` stays only as the default fallback used when no settings
// override is passed in.
export const GAP_NEUTRAL = 0.02
// A bit looser for the behaviour-deviation card (independent of user settings).
const BEHAVIOR_NEUTRAL = 0.03
// Symmetric ±2pp neutral band around 50% for the probability cards.
const PROB_NEUTRAL = 0.02

export const fmtGap = (v: number | null) => {
  if (v == null) return '-'
  const pp = v * 100
  const sign = pp >= 0 ? '+' : ''
  return `${sign}${pp.toFixed(2)} pp`
}

// ── Probability card tint ──────────────────────────────────────────────────
// Tints the 3 probability cards in row 1 (Live, Implied Hist, Realized Hist)
// according to which side the probability favours: green if P(UP) > 50%,
// red if P(UP) < 50%, neutral inside the ±2pp band.
export function probTintStyle(pUp: number | null): string {
  if (pUp == null) return 'border-border bg-surface-elevated'
  if (Math.abs(pUp - 0.5) < PROB_NEUTRAL) return 'border-border bg-surface-elevated'
  return pUp > 0.5
    ? 'border-green-400/30 bg-green-400/5'
    : 'border-red-400/30 bg-red-400/5'
}

// ── Gap card tri-state palettes ────────────────────────────────────────────
// Tri-state gap (over UP / under UP / calibrated). Used for the two
// "implied vs realized" comparisons (historical and live).
export function priceGapStyle(gap: number | null, threshold = GAP_NEUTRAL) {
  if (gap == null) {
    return {
      card: 'border-border bg-surface-elevated',
      label: 'text-muted',
      text: 'insufficient history',
    }
  }
  if (Math.abs(gap) < threshold) {
    return {
      card: 'border-border bg-surface-elevated',
      label: 'text-muted',
      text: 'well calibrated',
    }
  }
  if (gap > 0) {
    return {
      card: 'border-red-400/30 bg-red-400/5',
      label: 'text-red-400',
      text: 'live above historical UP rate',
    }
  }
  return {
    card: 'border-green-400/30 bg-green-400/5',
    label: 'text-green-400',
    text: 'live below historical UP rate',
  }
}

// Same tri-state palette, past-tense wording for the "Historical Calibration
// Gap" card. The subject is the past markets in this bucket, not the live
// market; present tense was visually contradicting the live-gap cards.
export function historicalGapStyle(gap: number | null, threshold = GAP_NEUTRAL) {
  if (gap == null) {
    return {
      card: 'border-border bg-surface-elevated',
      label: 'text-muted',
      text: 'insufficient history',
    }
  }
  if (Math.abs(gap) < threshold) {
    return {
      card: 'border-border bg-surface-elevated',
      label: 'text-muted',
      text: 'historically well calibrated',
    }
  }
  if (gap > 0) {
    return {
      card: 'border-red-400/30 bg-red-400/5',
      label: 'text-red-400',
      text: 'past markets over-priced ↑ UP',
    }
  }
  return {
    card: 'border-green-400/30 bg-green-400/5',
    label: 'text-green-400',
    text: 'past markets under-priced ↑ UP',
  }
}

// "Behavior deviation": is the live market quoting like similar past markets did?
// Amber (warning, not action) marks the card as an *anomaly indicator* rather
// than an actionable EV signal. Red/green are reserved for cards that affect a
// buy/sell decision; amber says "this is unusual, take note" without prescribing
// a direction.
export function behaviorGapStyle(gap: number | null, threshold = BEHAVIOR_NEUTRAL) {
  if (gap == null) {
    return {
      card: 'border-border bg-surface-elevated',
      label: 'text-muted',
      text: 'insufficient history',
    }
  }
  if (Math.abs(gap) < threshold) {
    return {
      card: 'border-border bg-surface-elevated',
      label: 'text-muted',
      text: 'behaving as usual',
    }
  }
  return {
    card: 'border-amber-400/30 bg-amber-400/5',
    label: 'text-amber-400',
    text: gap > 0
      ? 'unusually bullish on ↑ UP'
      : 'unusually bearish on ↑ UP',
  }
}

// ── Verdict bar tint ───────────────────────────────────────────────────────
export function verdictStyle(tone: Verdict['tone']) {
  if (tone === 'up') {
    return {
      card: 'border-green-400/40 bg-green-400/5',
      badge: 'bg-green-400/15 text-green-400 border border-green-400/30',
    }
  }
  if (tone === 'down') {
    return {
      card: 'border-red-400/40 bg-red-400/5',
      badge: 'bg-red-400/15 text-red-400 border border-red-400/30',
    }
  }
  return {
    card: 'border-border bg-surface-elevated',
    badge: 'bg-surface text-muted border border-border',
  }
}

// ── Gap card component ─────────────────────────────────────────────────────
interface GapCardProps {
  title: string
  tooltip: string
  value: number | null
  style: ReturnType<typeof priceGapStyle>
}

export default function GapCard({ title, tooltip, value, style }: GapCardProps) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${style.card}`}>
      <div className="text-xs text-muted mb-1 flex items-center">
        <span>{title}</span>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="text-xl font-bold text-white tabular-nums">
        {value == null ? '-' : fmtGap(value)}
      </div>
      <div className={`text-xs mt-0.5 ${style.label}`}>{style.text}</div>
    </div>
  )
}
