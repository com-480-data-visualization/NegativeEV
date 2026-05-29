// Constants, types, math helpers and small JSX helpers shared by the
// three branches of the trade verdict (no-data / calibrated / off-baseline).
// Kept React-aware (ReactNode / inline `<Em>` and `<DetailRow>`) because
// every consumer is inside the verdict tree.

import type { ReactNode } from 'react'

// ── Neutral bands ──────────────────────────────────────────────────────────
// Shared across the verdict logic and the gap/probability card styling.
export const PROB_NEUTRAL = 0.02       // ±2pp around 50% reads as a coin flip
export const BEHAVIOR_NEUTRAL = 0.03   // ±3pp around the historical implied
                                       // before the market is "atypical"

// ── Formatting ─────────────────────────────────────────────────────────────
export const fmtPct = (v: number | null) =>
  v == null ? '-' : `${(v * 100).toFixed(1)}%`

export function fmtMoney(v: number): string {
  const sign = v < 0 ? '−' : ''
  const abs = Math.abs(v)
  return `${sign}$${abs.toFixed(abs >= 100 ? 0 : 2)}`
}

// ── Math helpers ───────────────────────────────────────────────────────────

// Standard normal CDF (Abramowitz-Stegun 26.2.17). Accurate to ~7e-8.
export function normalCDF(z: number): number {
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
export function kellyFraction(R: number, L: number, buyUp: boolean): number {
  const f = buyUp ? (R - L) / (1 - L) : (L - R) / L
  return f > 0 ? f : 0
}

// Per-trade and cumulative variance metrics for placing a $1 bet on the
// EV+ side over the remaining N markets. Assumes future markets behave
// like the current calibration bucket - a strong assumption surfaced
// explicitly in the variance-band copy.
export function varianceMetrics(R: number, L: number, buyUp: boolean, N: number) {
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

// ── Verdict result type ───────────────────────────────────────────────────
export interface Verdict {
  action: string
  tone: 'up' | 'down' | 'neutral'
  content: ReactNode        // compact one-liner shown collapsed
  details: ReactNode        // expanded breakdown shown when the card is open
}

// ── Inline JSX helpers for the verdict text ───────────────────────────────

// Inline emphasis used inside the verdict text to make the key numbers pop.
export function Em({ tone, children }: { tone: 'up' | 'down' | 'amber' | 'white'; children: ReactNode }) {
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
export function DetailRow({ label, formula }: { label: ReactNode; formula: ReactNode }) {
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

// ── Shared "base rows" for the calibrated + off-baseline branches ─────────
// The three rows (R, L, signed gap) are identical in both regimes; factor
// out so the branch files only encode what's actually unique to them.
export interface BaseRowsInput {
  R: number                // realized historical
  L: number                // live implied
  realityGap: number       // L - R, already known non-null
  n: number                // sample count for this bucket
  evToneClass: 'text-green-400' | 'text-red-400'
  edgeThresholdPp: number  // user setting in pp (used for "well calibrated" muting)
}

export function buildBaseRows({
  R, L, realityGap, n, evToneClass, edgeThresholdPp,
}: BaseRowsInput): ReactNode {
  const Rstr = (R * 100).toFixed(2)
  const Lstr = (L * 100).toFixed(2)
  const gapSigned = L - R
  const gapPpStr = `${gapSigned >= 0 ? '+' : ''}${(gapSigned * 100).toFixed(2)} pp`
  const absGapPp = Math.abs(realityGap) * 100
  const gapToneClass = absGapPp < edgeThresholdPp ? 'text-muted' : evToneClass
  return (
    <>
      <DetailRow
        label={
          <>
            Realized P(UP wins) across{' '}
            <span className="font-semibold text-white">{n.toLocaleString()}</span> past markets in this (time, ΔBTC) bucket:
          </>
        }
        formula={<><span className="text-amber-400">R</span> = {Rstr}%</>}
      />
      <DetailRow
        label="Live implied P(UP wins), current UP token price:"
        formula={<><span className="text-amber-400">L</span> = {Lstr}%</>}
      />
      <DetailRow
        label="Live mispricing in pp (signed):"
        formula={
          <>
            <span className="text-amber-400">L − R</span> = {Lstr}% − {Rstr}% ={' '}
            <span className={`font-semibold ${gapToneClass}`}>{gapPpStr}</span>
          </>
        }
      />
    </>
  )
}
