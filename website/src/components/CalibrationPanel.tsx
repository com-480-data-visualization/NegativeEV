import { useState, type ReactNode } from 'react'
import type { CalibrationPoint } from '../lib/calibration'
import InfoTooltip from './InfoTooltip'
import UpDownSplit from './UpDownSplit'
import VerdictSettingsPanel, {
  DEFAULT_SETTINGS,
  type VerdictSettings,
} from './VerdictSettings'

interface Props {
  point: CalibrationPoint
  liveImplied: number     // current market yes_price ∈ [0, 1]
  upQty: number           // user's current ↑ UP token holdings
  downQty: number         // user's current ↓ DOWN token holdings
  balance: number         // user's cash balance (used for Kelly $ sizing)
  remainingMarkets: number // markets left in the session incl. the current one
                           // (used for the variance-band confidence interval)
}

// |gap| below this threshold (in raw probability units, e.g. 0.02 = 2 pp)
// is treated as "neutral / well calibrated". The reality / historical gap
// thresholds are now user-controlled via VerdictSettings.edgeThresholdPp;
// `GAP_NEUTRAL` stays only as the default fallback used when a settings
// override is not passed in.
const GAP_NEUTRAL = 0.02
const BEHAVIOR_NEUTRAL = 0.03   // a bit looser for behaviour deviation (independent of user settings)

const fmtGap = (v: number | null) => {
  if (v == null) return '—'
  const pp = v * 100
  const sign = pp >= 0 ? '+' : ''
  return `${sign}${pp.toFixed(2)} pp`
}

const fmtMoney = (v: number) => {
  const sign = v < 0 ? '−' : ''
  const abs = Math.abs(v)
  return `${sign}$${abs.toFixed(abs >= 100 ? 0 : 2)}`
}

// Standard normal CDF (Abramowitz-Stegun 26.2.17). Accurate to ~7e-8.
function normalCDF(z: number): number {
  if (z === 0) return 0.5
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp(-z * z / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

// Kelly-optimal bet as a fraction of bankroll for a binary prediction-market
// position. Returns 0 if the edge is non-positive (no bet).
//   Buy UP at price L (win prob R):   f* = (R − L) / (1 − L)
//   Buy DOWN at price (1 − L):        f* = (L − R) / L
function kellyFraction(R: number, L: number, buyUp: boolean): number {
  const f = buyUp ? (R - L) / (1 - L) : (L - R) / L
  return f > 0 ? f : 0
}

// Per-trade and cumulative variance metrics for placing a $1 bet on the
// EV+ side over the remaining N markets. Assumes future markets behave
// like the current calibration bucket — a strong assumption that we surface
// explicitly in the variance-band copy.
function varianceMetrics(R: number, L: number, buyUp: boolean, N: number) {
  const tokenPrice = buyUp ? L : (1 - L)
  // Bernoulli payoff per token: win = 1, lose = 0. Per $1 invested:
  //   mean return = (winProb − tokenPrice) / tokenPrice
  //   var  return = winProb (1 − winProb) / tokenPrice²
  const winProb = buyUp ? R : (1 - R)
  const meanPerDollar = (winProb - tokenPrice) / tokenPrice
  const stdPerDollar  = Math.sqrt(winProb * (1 - winProb)) / tokenPrice

  // Independent N trades → mean scales linearly, std as √N.
  const totalMean = N * meanPerDollar
  const totalStd  = Math.sqrt(N) * stdPerDollar
  const z = totalStd > 0 ? totalMean / totalStd : 0
  const pProfit = normalCDF(z)
  return { meanPerDollar, stdPerDollar, totalMean, totalStd, z, pProfit }
}

// ── Style helpers ──────────────────────────────────────────────────────────
// Tints the 3 probability cards in row 1 (Live, Implied Hist, Realized Hist)
// according to which side the probability favours: green if P(UP) > 50 %,
// red if P(UP) < 50 %, neutral inside a small ±2 pp band around 50 %.
const PROB_NEUTRAL = 0.02
function probTintStyle(pUp: number | null): string {
  if (pUp == null) return 'border-border bg-surface-elevated'
  if (Math.abs(pUp - 0.5) < PROB_NEUTRAL) return 'border-border bg-surface-elevated'
  return pUp > 0.5
    ? 'border-green-400/30 bg-green-400/5'
    : 'border-red-400/30 bg-red-400/5'
}

// Tri-state gap (over UP / under UP / calibrated). Used for the two
// "implied vs realized" comparisons (historical and live).
function priceGapStyle(gap: number | null, threshold = GAP_NEUTRAL) {
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
      text: 'market over-prices ↑ UP',
    }
  }
  return {
    card: 'border-green-400/30 bg-green-400/5',
    label: 'text-green-400',
    text: 'market under-prices ↑ UP',
  }
}

// Same tri-state palette as `priceGapStyle`, but with past-tense wording
// suited for the "Historical Calibration Gap" card. The subject is the
// *past markets in this bucket*, not the current live market — using the
// present tense here was visually contradicting the live-gap cards.
function historicalGapStyle(gap: number | null, threshold = GAP_NEUTRAL) {
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

// "Behavior deviation" : is the live market quoting like similar past markets did?
// Uses amber (warning, not action) to mark the card as an *anomaly indicator*
// rather than an actionable EV signal. Red/green are reserved for the cards
// that directly affect a buy/sell decision; amber says "this is unusual,
// take note" without prescribing a direction.
function behaviorGapStyle(gap: number | null, threshold = BEHAVIOR_NEUTRAL) {
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
      ? 'market is unusually bullish on ↑ UP'
      : 'market is unusually bearish on ↑ UP',
  }
}

// ── Trade verdict ──────────────────────────────────────────────────────────
// Turns the live calibration picture into a single actionable conclusion
// for the user. The *direction* of the edge is derived from the reality gap
// (Live − Realized Hist) — the only gap with EV semantics. The *action verb*
// (Buy / Sell / Hold) is then chosen based on the user's current holdings so
// the recommendation is always the most useful next move.
interface Verdict {
  action: string
  tone: 'up' | 'down' | 'neutral'
  content: ReactNode        // compact one-liner shown collapsed
  details: ReactNode        // expanded breakdown shown when the card is open
}

const fmtPct = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(1)}%`

// Inline emphasis used inside the verdict text to make the key numbers pop.
function Em({ tone, children }: { tone: 'up' | 'down' | 'amber' | 'white'; children: ReactNode }) {
  const color =
    tone === 'up'    ? 'text-green-400' :
    tone === 'down'  ? 'text-red-400'   :
    tone === 'amber' ? 'text-amber-400' :
                       'text-white'
  return <span className={`font-semibold ${color}`}>{children}</span>
}

// One row of the expanded calculation breakdown:
//   • <label, prose>
//        <formula, monospace>
function DetailRow({ label, formula }: { label: ReactNode; formula: ReactNode }) {
  return (
    <div>
      <div className="text-gray-400">
        <span className="text-gray-500 mr-1.5">•</span>{label}
      </div>
      <div className="pl-4 mt-1 font-mono text-[11px] text-white">
        {formula}
      </div>
    </div>
  )
}

function tradeVerdict(
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
  const edgeThreshold = settings.edgeThresholdPp / 100   // user-tunable, replaces GAP_NEUTRAL here

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
        ? <>The current bucket only has <Em tone="amber">{point.n}</Em> historical samples — below your minimum confidence threshold of {settings.minSamples}.</>
        : 'Not enough historical samples for this (time × BTC move) regime — no statistical baseline available yet.',
      details: (
        <div className="space-y-3 leading-relaxed">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Why no data?</div>
          <p>
            The calibration surface is a smoothed 2D grid indexed by{' '}
            <span className="font-mono text-white">(time remaining, BTC % change since open)</span>,
            built from <span className="font-semibold text-white">9,181</span> past Polymarket BTC 5-minute markets.
          </p>
          <p>
            To return a value, the cell containing the current{' '}
            <span className="font-mono text-white">(t, ΔBTC)</span> point needs at least{' '}
            <span className="font-semibold text-white">{settings.minSamples}</span> samples
            {settings.minSamples > 30 ? ' (your custom threshold, raised from the default 30)' : ''}.
            It currently has only <span className="font-semibold text-amber-400">{point.n}</span>{' '}
            sample{point.n === 1 ? '' : 's'}, so the estimate is suppressed to avoid acting on noise.
          </p>
        </div>
      ),
    }
  }

  // ── Shared numeric setup for the well-calibrated and edge cases ─────
  const R = point.realized
  const L = liveImplied
  const Rstr = (R * 100).toFixed(2)
  const Lstr = (L * 100).toFixed(2)
  const gapSigned = L - R
  const gapPpStr = `${gapSigned >= 0 ? '+' : ''}${(gapSigned * 100).toFixed(2)} pp`
  const absGapPp = Math.abs(realityGap) * 100
  const buyUp = realityGap < 0
  const evSide = buyUp ? 'UP' : 'DOWN'
  const evArrow = buyUp ? '↑' : '↓'
  const evPrice = buyUp ? L : (1 - L)
  const evPriceStr = (evPrice * 100).toFixed(2)
  const edgePct = buyUp ? -realityGap / L : realityGap / (1 - L)
  const edgeStr = `+${(edgePct * 100).toFixed(1)}%`
  const edgeStrFull = `+${(edgePct * 100).toFixed(2)}%`
  const evToneClass = buyUp ? 'text-green-400' : 'text-red-400'
  const gapToneClass = absGapPp < settings.edgeThresholdPp
    ? 'text-muted'
    : evToneClass

  // The 3 base rows (R, L, gap) are the same in every "we have data" branch.
  const baseRows = (
    <>
      <DetailRow
        label={
          <>
            Historical realized P(UP wins) — averaged over{' '}
            <span className="font-semibold text-white">{point.n.toLocaleString()}</span> past markets in this (time × ΔBTC) bucket:
          </>
        }
        formula={<><span className="text-amber-400">R</span> = {Rstr}%</>}
      />
      <DetailRow
        label="Live implied P(UP wins) — current market price of the UP token:"
        formula={<><span className="text-amber-400">L</span> = {Lstr}%</>}
      />
      <DetailRow
        label="Live mispricing in percentage points (signed):"
        formula={
          <>
            <span className="text-amber-400">L − R</span> = {Lstr}% − {Rstr}% ={' '}
            <span className={`font-semibold ${gapToneClass}`}>{gapPpStr}</span>
          </>
        }
      />
    </>
  )

  // ── 2. Well calibrated (no edge) ─────────────────────────────────────
  if (Math.abs(realityGap) < edgeThreshold) {
    return {
      action: 'No clear edge',
      tone: 'neutral',
      content: (
        <>
          Live price (<Em tone="white">{fmtPct(liveImplied)}</Em>) is close to the historical UP-win frequency (<Em tone="white">{fmtPct(point.realized)}</Em>) — fair pricing, no actionable mispricing.
          {(hasUp || hasDown) && <> Your current positions are fairly priced — no urgent action.</>}
        </>
      ),
      details: (
        <div className="space-y-3 leading-relaxed">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">How we compute this</div>
          <div className="space-y-2.5">{baseRows}</div>
          <div className="pt-2 border-t border-border/20 text-gray-300">
            <span className="text-gray-400">Verdict logic: </span>
            the absolute gap of <span className="font-semibold text-white">{absGapPp.toFixed(2)} pp</span> is below your{' '}
            <span className="font-semibold text-white">{settings.edgeThresholdPp.toFixed(1)} pp</span> neutrality threshold — within the noise band where past markets in this regime have been well calibrated. No actionable edge to trade, so we don't compute an EV.
          </div>
        </div>
      ),
    }
  }

  // ── 3. Edge detected — branch on holdings ───────────────────────────
  const tone         = (buyUp ? 'up' : 'down') as 'up' | 'down'
  const badSide      = buyUp ? 'DOWN' : 'UP'
  const badArrow     = buyUp ? '↓'    : '↑'
  const hasEvSide    = buyUp ? hasUp  : hasDown
  const hasBadSide   = buyUp ? hasDown : hasUp

  const sizePp  = (Math.abs(realityGap) * 100).toFixed(1)
  const liveStr = fmtPct(liveImplied)
  const realStr = fmtPct(point.realized)

  // Shared opening sentence reused across every edge branch.
  const framing = (
    <>
      Historically UP wins <Em tone={tone}>{realStr}</Em> of the time here, but the market is currently pricing UP at {buyUp ? 'only ' : ''}<Em tone={tone}>{liveStr}</Em> — {buyUp ? 'under' : 'over'}-priced by <Em tone={tone}>{sizePp} pp</Em>.{' '}
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
      <> This market is also quoting atypically (<Em tone="amber">{bpp} pp</Em> from the historical norm) — the edge could be amplified by fresh news or thin liquidity.</>
    )
  }

  let action: string
  let body: ReactNode

  if (hasBadSide) {
    action = `Sell ${badArrow} ${badSide}`
    body = hasEvSide
      ? (
        <>
          Your {badArrow} {badSide} position is on the negative-EV side — sell it now to stop the bleed. Keep your {evArrow} {evSide} (positive-EV side, <Em tone={tone}>{edgeStr}</Em> expected return per $1 invested).
        </>
      )
      : (
        <>
          Your {badArrow} {badSide} position is on the negative-EV side — sell it now to stop the bleed, then flip the freed capital into {evArrow} {evSide} for <Em tone={tone}>{edgeStr}</Em> expected return per $1 invested.
        </>
      )
  } else if (hasEvSide) {
    action = `Hold ${evArrow} ${evSide}`
    body = (
      <>
        You already hold {evArrow} {evSide} (positive-EV side) — the edge is <Em tone={tone}>{edgeStr}</Em> per $1, so consider adding to your position rather than closing it.
      </>
    )
  } else {
    action = `Buy ${evArrow} ${evSide}`
    body = (
      <>
        Buying {evArrow} {evSide} has a positive expected value of <Em tone={tone}>{edgeStr}</Em> per $1 invested.
      </>
    )
  }

  // ── Kelly bet sizing recommendation (optional, settings-driven) ─────
  // Always reported as a fraction of the current cash balance, even when
  // the verdict is "Sell" (post-sell balance ≈ balance + sell proceeds,
  // so this is a slight under-estimate — flagged in the tooltip).
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

  // Expanded calculation breakdown — shown when the verdict card is opened.
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
                <span className="font-semibold text-white">{remainingMarkets}</span> remaining markets at similar mispricings:
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
        the absolute gap of <span className="font-semibold text-white">{absGapPp.toFixed(2)} pp</span> exceeds your{' '}
        <span className="font-semibold text-white">{settings.edgeThresholdPp.toFixed(1)} pp</span> neutrality threshold, so the mispricing is flagged as actionable.{' '}
        If past calibration holds, every <span className="font-mono text-white">$1</span> placed on {evArrow} {evSide} would return{' '}
        <span className={`font-semibold ${evToneClass}`}>${(1 + edgePct).toFixed(3)}</span> on average at resolution.
        {variance && (
          <>
            {' '}However, over only <span className="font-semibold text-white">{remainingMarkets}</span> remaining trades the realised outcome has a 1σ swing of{' '}
            <span className="font-semibold text-white">±{fmtMoney(variance.totalStd)}</span>{' '}
            around the <span className={`font-semibold ${evToneClass}`}>{fmtMoney(variance.totalMean)}</span> mean — variance can easily dominate the edge for thin mispricings.
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

function verdictStyle(tone: Verdict['tone']) {
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

// ── Reusable gap card ──────────────────────────────────────────────────────
interface GapCardProps {
  title: string
  tooltip: string
  value: number | null
  style: ReturnType<typeof priceGapStyle>
}

function GapCard({ title, tooltip, value, style }: GapCardProps) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${style.card}`}>
      <div className="text-xs text-muted mb-1 flex items-center">
        <span>{title}</span>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="text-xl font-bold text-white tabular-nums">
        {value == null ? '—' : fmtGap(value)}
      </div>
      <div className={`text-xs mt-0.5 ${style.label}`}>{style.text}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function CalibrationPanel({
  point, liveImplied, upQty, downQty, balance, remainingMarkets,
}: Props) {
  const [settings, setSettings] = useState<VerdictSettings>(DEFAULT_SETTINGS)
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const histGap = point.gap                                                          // implied hist - realized hist
  const behaviorGap = point.implied != null ? liveImplied - point.implied : null     // live - implied hist
  const realityGap = point.realized != null ? liveImplied - point.realized : null    // live - realized hist

  // The user's edge threshold drives both the gap-card coloring (so "well
  // calibrated" matches what the verdict considers actionable) and the
  // verdict logic itself. The behavior gap keeps its own independent
  // BEHAVIOR_NEUTRAL band — it's a separate concept (atypicality, not edge).
  const edgeThreshold = settings.edgeThresholdPp / 100
  const histStyle     = historicalGapStyle(histGap, edgeThreshold)
  const behaviorStyle = behaviorGapStyle(behaviorGap)
  const realityStyle  = priceGapStyle(realityGap, edgeThreshold)

  const verdict = tradeVerdict(
    point, liveImplied, realityGap, behaviorGap,
    upQty, downQty, settings, balance, remainingMarkets,
  )
  const vStyle = verdictStyle(verdict.tone)

  return (
    <div className="flex flex-col gap-3">

      {/* ── Row 1: probability values (Live + 2 historical baselines) ──── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Live Implied Probability */}
        <div className={`rounded-xl border p-4 transition-colors ${probTintStyle(liveImplied)}`}>
          <div className="text-xs text-muted mb-1 flex items-center">
            <span>Live Implied Probability</span>
            <InfoTooltip
              text="The current market price of each token, equal to the probability the market currently assigns to each outcome. UP + DOWN always sums to 100%."
            />
          </div>
          <UpDownSplit pUp={liveImplied} />
          <div className="text-xs text-muted mt-0.5">what the market thinks now</div>
        </div>

        {/* Implied Historical Probability */}
        <div className={`rounded-xl border p-4 transition-colors ${probTintStyle(point.implied)}`}>
          <div className="text-xs text-muted mb-1 flex items-center">
            <span>Implied Historical Probability</span>
            <InfoTooltip
              text="Average UP token price observed in past markets that were in the same time & price-move bucket. What the market typically thought the odds were in this situation."
            />
          </div>
          <UpDownSplit pUp={point.implied} />
          <div className="text-xs text-muted mt-0.5">what the market predicted in the past</div>
        </div>

        {/* Realized Historical Probability */}
        <div className={`rounded-xl border p-4 transition-colors ${probTintStyle(point.realized)}`}>
          <div className="text-xs text-muted mb-1 flex items-center">
            <span>Realized Historical Probability</span>
            <InfoTooltip
              text="Empirical frequency of UP wins in past markets that were in the same time & price-move bucket. What actually happened, measured after the fact."
            />
          </div>
          <UpDownSplit pUp={point.realized} />
          <div className="text-xs text-muted mt-0.5">what actually happened in the past</div>
        </div>
      </div>

      {/* ── Row 2: gaps (live deviations + historical calibration) ────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Live vs Historical Implied (behavior) */}
        <GapCard
          title="Live vs Historical Implied"
          tooltip="Live Implied minus Implied Historical, in percentage points. Tells you whether this specific market is pricing UP like similar markets in the past, or unusually high/low. Large deviations mean atypical market behavior — could reveal news, a surge in volume, or just a thin order book."
          value={behaviorGap}
          style={behaviorStyle}
        />

        {/* Live vs Historical Realized (mispricing) */}
        <GapCard
          title="Live vs Historical Realized"
          tooltip="Live Implied minus Realized Historical, in percentage points. Positive = the market is currently over-pricing UP relative to the empirical frequency of UP wins in similar past situations (buying UP would be EV−). Negative = under-pricing UP (buying UP would be EV+). This is the actionable mispricing signal."
          value={realityGap}
          style={realityStyle}
        />

        {/* Historical Calibration Gap */}
        <GapCard
          title="Historical Calibration Gap"
          tooltip="Implied historical minus Realized historical, in percentage points. Positive = past markets in this situation typically over-priced UP. Negative = past markets typically under-priced UP. This measures how well-calibrated the market has been historically — independent of the live price."
          value={histGap}
          style={histStyle}
        />
      </div>

      {/* ── Verdict: live trading conclusion ─────────────────────────── */}
      {/* The collapsed bar is a single contiguous paragraph with inline
          coloured highlights on the key numbers (min-height keeps it stable
          across verdict states). Clicking the bar expands a breakdown of
          the live calculations underneath. */}
      <div className={`rounded-xl border transition-colors ${vStyle.card}`}>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="w-full p-4 text-left rounded-xl hover:bg-white/[0.02] transition-colors min-h-[7rem] flex items-center gap-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Verdict</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-semibold tabular-nums ${vStyle.badge}`}>
                {verdict.action}
              </span>
            </div>
            <div className="text-xs leading-relaxed text-gray-300 min-w-0 flex-1">
              {verdict.content}
            </div>
          </div>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`shrink-0 w-4 h-4 text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {expanded && (
          // Fixed min-height calibrated on the largest verdict layout (Kelly
          // + variance band both visible adds two extra DetailRows). Smaller
          // cases (no edge → 3 rows, no data → 2 paragraphs) sit at the top
          // with some bottom whitespace — but the panel never jumps tick-to-
          // tick when the verdict crosses the threshold.
          <div className="border-t border-border/40 px-4 py-3 text-xs min-h-[26rem]">
            {verdict.details}
          </div>
        )}
      </div>

      {/* ── Verdict settings (sits just below the verdict so the user can
          tune sensitivity, Kelly, variance display without leaving the
          calibration block) ─────────────────────────────────────────── */}
      <VerdictSettingsPanel
        settings={settings}
        onChange={setSettings}
        expanded={settingsExpanded}
        onToggleExpanded={() => setSettingsExpanded(e => !e)}
      />

    </div>
  )
}
