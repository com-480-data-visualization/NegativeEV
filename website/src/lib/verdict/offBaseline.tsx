// "Off-baseline" verdict branch: the live quote drifts far enough from
// the 9,181-market baseline that we trust the baseline more than the
// live price. The action is always toward the side history favors;
// EV / Kelly / variance quantify what that contrarian bet is worth.

import type { ReactNode } from 'react'
import type { CalibrationPoint } from '../calibration'
import type { VerdictSettings } from '../../components/VerdictSettings'
import {
  BEHAVIOR_NEUTRAL,
  buildBaseRows,
  DetailRow,
  Em,
  fmtMoney,
  fmtPct,
  kellyFraction,
  varianceMetrics,
  type Verdict,
} from './shared'

interface Input {
  point: CalibrationPoint
  R: number                  // realized historical (P(UP))
  L: number                  // live implied  (P(UP))
  realityGap: number         // L - R, already known non-null and outside neutral band
  behaviorGap: number | null
  hasUp: boolean
  hasDown: boolean
  settings: VerdictSettings
  balance: number
  remainingMarkets: number
}

export function offBaselineVerdict({
  point, R, L, realityGap, behaviorGap,
  hasUp, hasDown, settings, balance, remainingMarkets,
}: Input): Verdict {
  // ── Direction / sizing ─────────────────────────────────────────────────
  const buyUp = realityGap < 0
  const evSide = buyUp ? 'UP' : 'DOWN'
  const evArrow = buyUp ? '↑' : '↓'
  const evPrice = buyUp ? L : (1 - L)
  const evPriceStr = (evPrice * 100).toFixed(2)
  const edgePct = buyUp ? -realityGap / L : realityGap / (1 - L)
  const edgeStr = `+${(edgePct * 100).toFixed(1)}%`
  const edgeStrFull = `+${(edgePct * 100).toFixed(2)}%`
  const evToneClass = buyUp ? 'text-green-400' : 'text-red-400'

  const tone       = (buyUp ? 'up' : 'down') as 'up' | 'down'
  const badSide    = buyUp ? 'DOWN' : 'UP'
  const badArrow   = buyUp ? '↓'    : '↑'
  const hasEvSide  = buyUp ? hasUp  : hasDown
  const hasBadSide = buyUp ? hasDown : hasUp

  const sizePp  = (Math.abs(realityGap) * 100).toFixed(1)
  const absGapPp = Math.abs(realityGap) * 100

  // Shared opening sentence reused across every action branch below.
  // Anchors the user in *why* we are deviating from "follow the market":
  // the live quote disagrees with the historical record.
  const framing = (
    <>
      History shows UP winning <Em tone={tone}>{fmtPct(R)}</Em> of the time here, but the live price is {buyUp ? 'only ' : ''}<Em tone={tone}>{fmtPct(L)}</Em>, a <Em tone={tone}>{sizePp} pp</Em> divergence from the baseline. We trust the 9,181-market record over the live quote.{' '}
    </>
  )

  // Trailing caveat (data-quality OR atypical-behaviour). Folded into the
  // same sentence so the card stays a single contiguous paragraph.
  let caveatNode: ReactNode = null
  if (point.confidence === 'low') {
    caveatNode = (
      <> <Em tone="amber">Low confidence</Em>: based on only {point.n} historical samples.</>
    )
  } else if (behaviorGap != null && Math.abs(behaviorGap) > BEHAVIOR_NEUTRAL) {
    const bpp = (Math.abs(behaviorGap) * 100).toFixed(1)
    caveatNode = (
      <> The market is also quoting atypically (<Em tone="amber">{bpp} pp</Em> from the norm), possibly amplified by breaking news or thin liquidity.</>
    )
  }

  // ── Action verb chosen from the user's current holdings ───────────────
  let action: string
  let body: ReactNode
  if (hasBadSide) {
    action = `Sell ${badArrow} ${badSide}`
    body = hasEvSide
      ? (
        <>
          Your {badArrow} {badSide} position is on the wrong side; sell it to stop the bleed. Keep your {evArrow} {evSide}, aligned with the baseline at <Em tone={tone}>{edgeStr}</Em> expected return per $1.
        </>
      )
      : (
        <>
          Your {badArrow} {badSide} position is on the wrong side; sell it to stop the bleed, then move the freed capital into {evArrow} {evSide} for <Em tone={tone}>{edgeStr}</Em> expected return per $1.
        </>
      )
  } else if (hasEvSide) {
    action = `Hold ${evArrow} ${evSide}`
    body = (
      <>
        You hold {evArrow} {evSide}, aligned with the baseline. Expected return is <Em tone={tone}>{edgeStr}</Em> per $1, so consider adding rather than closing.
      </>
    )
  } else {
    action = `Buy ${evArrow} ${evSide}`
    body = (
      <>
        Betting against the live price on {evArrow} {evSide}, the side history favors, has an expected return of <Em tone={tone}>{edgeStr}</Em> per $1.
      </>
    )
  }

  // ── Kelly bet sizing recommendation (optional, settings-driven) ─────
  // Always reported as a fraction of the current cash balance, even when
  // the verdict is "Sell" (post-sell balance ≈ balance + sell proceeds,
  // so this is a slight under-estimate - flagged in the tooltip).
  const fullKelly = kellyFraction(R, L, buyUp)
  const usedKelly = fullKelly * settings.kellyFraction
  const kellyBet  = usedKelly * balance
  const kellyNode: ReactNode = settings.kellyFraction > 0 && kellyBet > 0.5
    ? (
      <> Recommended bet: <Em tone={tone}>{fmtMoney(kellyBet)}</Em>{' '}
        (<span className="font-mono text-white">{(usedKelly * 100).toFixed(1)}%</span> of bankroll,{' '}
        {settings.kellyFraction === 1 ? 'full' : `${settings.kellyFraction}×`} Kelly).
      </>
    )
    : null

  // ── Variance band over the remaining session (optional) ─────────────
  const variance = settings.showVarianceBand && remainingMarkets > 0
    ? varianceMetrics(R, L, buyUp, remainingMarkets)
    : null

  const baseRows = buildBaseRows({
    R, L, realityGap, n: point.n,
    evToneClass,
    edgeThresholdPp: settings.edgeThresholdPp,
  })
  const gapSigned = L - R

  // Expanded calculation breakdown - shown when the verdict card is opened.
  const details = (
    <div className="space-y-3 leading-relaxed">
      <div className="text-[10px] uppercase tracking-wider text-gray-400">How we compute this</div>
      <div className="space-y-2.5">
        {baseRows}
        <DetailRow
          label={
            <>
              Expected return per $1 invested on {evArrow} {evSide} (cost{' '}
              <span className="font-mono text-white">{evPriceStr}¢</span>/token):
            </>
          }
          formula={
            <>
              <span className="text-amber-400">EV</span> = |L − R| / {buyUp ? 'L' : '(1 − L)'} ={' '}
              {Math.abs(gapSigned).toFixed(4)} / {evPrice.toFixed(4)} ={' '}
              <span className={`font-semibold ${evToneClass}`}>{edgeStrFull}</span>
            </>
          }
        />
        {settings.kellyFraction > 0 && (
          <DetailRow
            label={
              <>
                Kelly-optimal bet fraction (capped by{' '}
                <span className="font-mono text-white">
                  {settings.kellyFraction === 1 ? 'full' : `${settings.kellyFraction}×`}
                </span>
                {' '}Kelly), applied to balance{' '}
                <span className="font-mono text-white">{fmtMoney(balance)}</span>:
              </>
            }
            formula={
              <>
                <span className="text-amber-400">f*</span> = |L − R| / {buyUp ? '(1 − L)' : 'L'} ={' '}
                <span className="text-white">{(fullKelly * 100).toFixed(2)}%</span>{' '}→{' '}
                <span className="text-amber-400">bet</span> = {(settings.kellyFraction).toFixed(2)} × {(fullKelly * 100).toFixed(2)}% × {fmtMoney(balance)} ={' '}
                <span className={`font-semibold ${evToneClass}`}>{fmtMoney(kellyBet)}</span>
              </>
            }
          />
        )}
        {variance && (
          <DetailRow
            label={
              <>
                Cumulative return if you bet <span className="font-mono text-white">$1</span> on each of the{' '}
                <span className="font-semibold text-white">{remainingMarkets}</span> remaining markets at similar divergences:
              </>
            }
            formula={
              <>
                <span className="text-amber-400">μ ± σ</span> = N · EV ± √N · σ₁ ={' '}
                <span className={`font-semibold ${evToneClass}`}>{fmtMoney(variance.totalMean)}</span>{' '}±{' '}
                <span className="font-semibold text-white">{fmtMoney(variance.totalStd)}</span>{', '}
                <span className="text-amber-400">P(profit)</span> ≈{' '}
                <span className={`font-semibold ${variance.pProfit >= 0.7 ? 'text-green-400' : variance.pProfit >= 0.55 ? 'text-amber-400' : 'text-red-400'}`}>
                  {(variance.pProfit * 100).toFixed(0)}%
                </span>
              </>
            }
          />
        )}
      </div>
      <div className="pt-2 border-t border-border/20 text-gray-300">
        <span className="text-gray-400">Verdict logic: </span>
        the {absGapPp.toFixed(2)} pp gap exceeds your{' '}
        <span className="font-semibold text-white">{settings.edgeThresholdPp.toFixed(1)} pp</span> neutrality band, so the live price is off-baseline and we recommend betting toward history.{' '}
        If past calibration holds, each <span className="font-mono text-white">$1</span> on {evArrow} {evSide} returns{' '}
        <span className={`font-semibold ${evToneClass}`}>${(1 + edgePct).toFixed(3)}</span> on average.
        {variance && (
          <>
            {' '}Over only <span className="font-semibold text-white">{remainingMarkets}</span> remaining trades, the 1σ swing is{' '}
            <span className="font-semibold text-white">±{fmtMoney(variance.totalStd)}</span>{' '}
            around the <span className={`font-semibold ${evToneClass}`}>{fmtMoney(variance.totalMean)}</span> mean. Variance can easily swamp the expected return on thin divergences.
          </>
        )}
      </div>
    </div>
  )

  return {
    action,
    tone,
    content: (
      <>
        {framing}
        {body}
        {kellyNode}
        {caveatNode}
      </>
    ),
    details,
  }
}
