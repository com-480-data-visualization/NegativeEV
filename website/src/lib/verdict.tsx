// Trade verdict orchestrator for the live calibration panel.
//
// Dispatches between three branches based on the live calibration picture:
//   - no data        : suppressed verdict, asks the user to wait
//   - calibrated     : live price ≈ historical baseline -> follow the market
//   - off-baseline   : live price drifts from baseline -> bet against it
//
// Each branch is its own module under verdict/; the math, types and shared
// JSX helpers live in verdict/shared.tsx. The public API (`tradeVerdict`,
// `Verdict`, `PROB_NEUTRAL`, `BEHAVIOR_NEUTRAL`) is re-exported from here
// so consumers keep importing from `lib/verdict`.

import type { CalibrationPoint } from './calibration'
import type { VerdictSettings } from '../components/VerdictSettings'
import { calibratedVerdict } from './verdict/calibrated'
import { offBaselineVerdict } from './verdict/offBaseline'
import { Em, type Verdict } from './verdict/shared'

export type { Verdict } from './verdict/shared'
export {
  BEHAVIOR_NEUTRAL,
  PROB_NEUTRAL,
  fmtMoney,
  fmtPct,
  kellyFraction,
  normalCDF,
  varianceMetrics,
} from './verdict/shared'

export function tradeVerdict(
  point: CalibrationPoint,
  liveImplied: number,
  realityGap: number | null,
  behaviorGap: number | null,
  upQty: number,
  downQty: number,
  settings: VerdictSettings,
  balance: number,
  remainingMarkets: number,
): Verdict {
  const hasUp = upQty > 0
  const hasDown = downQty > 0

  // ── 1. No statistical baseline ───────────────────────────────────────
  // Either the lookup returned no data (cells with N < 30 in the table) or
  // the user has demanded a stricter min-samples threshold than the table's
  // built-in 30 cutoff.
  const noLookupData = realityGap == null || point.realized == null || point.confidence === 'none'
  const belowUserSampleThreshold = point.n < settings.minSamples
  if (noLookupData || belowUserSampleThreshold) {
    return {
      action: 'Wait',
      tone: 'neutral',
      content: belowUserSampleThreshold && !noLookupData
        ? <>This bucket has only <Em tone="amber">{point.n}</Em> historical samples, below your minimum of {settings.minSamples}.</>
        : 'Not enough data for this (time, BTC move) combination. No statistical baseline available.',
      details: (
        <div className="space-y-3 leading-relaxed">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Why no data?</div>
          <p>
            The calibration grid covers all{' '}
            <span className="font-mono text-white">(time remaining, BTC % change since open)</span>{' '}
            combinations, built from{' '}
            <span className="font-semibold text-white">9,181</span> past markets.
          </p>
          <p>
            This cell needs at least{' '}
            <span className="font-semibold text-white">{settings.minSamples}</span> samples
            {settings.minSamples > 30 ? ' (your custom threshold, raised from the default 30)' : ''}{' '}
            to return a reliable estimate. It currently has{' '}
            <span className="font-semibold text-amber-400">{point.n}</span>{' '}
            sample{point.n === 1 ? '' : 's'}, so the verdict is suppressed to avoid acting on noise.
          </p>
        </div>
      ),
    }
  }

  // From here on the lookup is valid: hand off to the regime branch.
  const R = point.realized
  const L = liveImplied
  const edgeThreshold = settings.edgeThresholdPp / 100
  const shared = { R, L, realityGap, n: point.n, hasUp, hasDown, settings } as const

  if (Math.abs(realityGap) < edgeThreshold) {
    return calibratedVerdict(shared)
  }
  return offBaselineVerdict({
    ...shared,
    point,
    behaviorGap,
    balance,
    remainingMarkets,
  })
}
