// "Calibrated" verdict branch: the live price agrees with the historical
// baseline, so we treat the live quote as the true probability and surface
// which side it favors (or flag a true coin flip). EV / Kelly are
// intentionally skipped here: when EV ~ 0 the optimal stake is 0.

import type { ReactNode } from 'react'
import type { VerdictSettings } from '../../components/VerdictSettings'
import {
  buildBaseRows,
  Em,
  fmtPct,
  PROB_NEUTRAL,
  type Verdict,
} from './shared'

interface Input {
  R: number                  // realized historical (P(UP))
  L: number                  // live implied  (P(UP))
  realityGap: number         // L - R
  n: number                  // bucket sample count
  hasUp: boolean
  hasDown: boolean
  settings: VerdictSettings
}

export function calibratedVerdict({
  R, L, realityGap, n, hasUp, hasDown, settings,
}: Input): Verdict {
  const favUp    = R > 0.5 + PROB_NEUTRAL
  const favDown  = R < 0.5 - PROB_NEUTRAL
  const coinFlip = !favUp && !favDown
  const favTone: Verdict['tone'] = favUp ? 'up' : favDown ? 'down' : 'neutral'

  let action: string
  let content: ReactNode

  if (coinFlip) {
    action = 'Coin flip · sit out'
    content = (
      <>
        Live (<Em tone="white">{fmtPct(L)}</Em>) and the historical UP rate
        (<Em tone="white">{fmtPct(R)}</Em>) agree on{' '}
        <Em tone="white">50/50</Em>. The market is calibrated and neither side has an edge.
        {(hasUp || hasDown) && <> Your open positions are on a coin flip; close them unless you have a personal view.</>}
      </>
    )
  } else {
    const arrow    = favUp ? '↑' : '↓'
    const side     = favUp ? 'UP' : 'DOWN'
    const oppArrow = favUp ? '↓' : '↑'
    const oppSide  = favUp ? 'DOWN' : 'UP'
    const favPct   = fmtPct(favUp ? R : (1 - R))
    const dispTone: 'up' | 'down' = favUp ? 'up' : 'down'
    const hasFav   = favUp ? hasUp : hasDown
    const hasOpp   = favUp ? hasDown : hasUp

    action = `Follow market · ${arrow} ${side}`
    const tail = hasOpp ? (
      <> You hold {oppArrow} {oppSide}, the historically losing side at a fair price. Close it if you don't have a personal view.</>
    ) : hasFav ? (
      <> You already hold {arrow} {side}, the favored side at a fair price.</>
    ) : (
      <> If you want exposure, {arrow} {side} is a fair entry. Otherwise sit this round out.</>
    )
    content = (
      <>
        Live (<Em tone="white">{fmtPct(L)}</Em>) matches the historical UP rate
        (<Em tone="white">{fmtPct(R)}</Em>). The market is calibrated here, so
        the live price is a reliable probability. History favors{' '}
        <Em tone={dispTone}>{arrow} {side}</Em> at <Em tone={dispTone}>{favPct}</Em>.{tail}
      </>
    )
  }

  // For the "well calibrated" branch evToneClass is irrelevant (gap is
  // under the threshold so gapToneClass collapses to muted anyway); pass
  // green as a benign placeholder.
  const baseRows = buildBaseRows({
    R, L, realityGap, n,
    evToneClass: 'text-green-400',
    edgeThresholdPp: settings.edgeThresholdPp,
  })
  const absGapPp = Math.abs(realityGap) * 100

  return {
    action,
    tone: favTone,
    content,
    details: (
      <div className="space-y-3 leading-relaxed">
        <div className="text-[10px] uppercase tracking-wider text-gray-400">How we compute this</div>
        <div className="space-y-2.5">{baseRows}</div>
        <div className="pt-2 border-t border-border/20 text-gray-300">
          <span className="text-gray-400">Verdict logic: </span>
          the {absGapPp.toFixed(2)} pp gap falls within your{' '}
          <span className="font-semibold text-white">{settings.edgeThresholdPp.toFixed(1)} pp</span> neutrality band. Past markets in this regime have been well calibrated, so we treat the live price as the true probability. Kelly bet sizing is skipped: when expected value is ~0, the optimal stake is 0.
        </div>
      </div>
    ),
  }
}
