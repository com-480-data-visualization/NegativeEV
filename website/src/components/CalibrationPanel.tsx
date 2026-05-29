import { useState } from 'react'
import type { CalibrationPoint } from '../lib/calibration'
import InfoTooltip from './InfoTooltip'
import UpDownSplit from './UpDownSplit'
import VerdictSettingsPanel, {
  DEFAULT_SETTINGS,
  type VerdictSettings,
} from './VerdictSettings'
import GapCard, {
  behaviorGapStyle,
  historicalGapStyle,
  priceGapStyle,
  probTintStyle,
  verdictStyle,
} from './calibration/GapCard'
import { useHeldVerdict } from './calibration/useHeldVerdict'
import { tradeVerdict } from '../lib/verdict'

interface Props {
  point: CalibrationPoint
  liveImplied: number      // current market yes_price ∈ [0, 1]
  upQty: number            // user's current ↑ UP token holdings
  downQty: number          // user's current ↓ DOWN token holdings
  balance: number          // user's cash balance (used for Kelly $ sizing)
  remainingMarkets: number // markets left in the session incl. the current one
                           // (used for the variance-band confidence interval)
  showVerdict?: boolean    // false in "no-verdict" difficulty: hides the
                           // verdict card + VerdictSettingsPanel, leaving
                           // rows 1 (probabilities) + 2 (gap cards) visible
}

export default function CalibrationPanel({
  point, liveImplied, upQty, downQty, balance, remainingMarkets,
  showVerdict = true,
}: Props) {
  const [settings, setSettings] = useState<VerdictSettings>(DEFAULT_SETTINGS)
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const histGap = point.gap                                                       // implied hist - realized hist
  const behaviorGap = point.implied != null ? liveImplied - point.implied : null  // live - implied hist
  const realityGap = point.realized != null ? liveImplied - point.realized : null // live - realized hist

  // The user's edge threshold drives both the gap-card coloring (so "well
  // calibrated" matches the regime the verdict picks) and the verdict mode
  // switch itself (follow-market vs bet-against-the-market). The behavior
  // gap keeps its own independent BEHAVIOR_NEUTRAL band - a separate concept
  // (atypicality, not regime).
  const edgeThreshold = settings.edgeThresholdPp / 100
  const histStyle     = historicalGapStyle(histGap, edgeThreshold)
  const behaviorStyle = behaviorGapStyle(behaviorGap)
  const realityStyle  = priceGapStyle(realityGap, edgeThreshold)

  const rawVerdict = tradeVerdict(
    point, liveImplied, realityGap, behaviorGap,
    upQty, downQty, settings, balance, remainingMarkets,
  )

  // Verdict hold (hysteresis): a new action only takes over after it has
  // been the raw verdict for `verdictHoldSec` consecutive seconds. Until
  // then, we display the cached verdict (numbers and all) so the body
  // stays consistent with the visible action label. When the action is
  // unchanged from one tick to the next we refresh the cache with the
  // latest numbers - smoothing only kicks in around regime switches,
  // not during normal in-mode price drift.
  const verdict = useHeldVerdict(rawVerdict, settings.verdictHoldSec)
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
              text="Current token prices: the probabilities the market assigns to each outcome right now. UP + DOWN always sum to 100%."
            />
          </div>
          <UpDownSplit pUp={liveImplied} />
          <div className="text-xs text-muted mt-0.5">the market's live probability</div>
        </div>

        {/* Implied Historical Probability */}
        <div className={`rounded-xl border p-4 transition-colors ${probTintStyle(point.implied)}`}>
          <div className="text-xs text-muted mb-1 flex items-center">
            <span>Implied Historical Probability</span>
            <InfoTooltip
              text="Average UP token price in past markets matching the same (time, BTC move) bucket. What the market typically priced this situation at."
            />
          </div>
          <UpDownSplit pUp={point.implied} />
          <div className="text-xs text-muted mt-0.5">what past markets priced it at</div>
        </div>

        {/* Realized Historical Probability */}
        <div className={`rounded-xl border p-4 transition-colors ${probTintStyle(point.realized)}`}>
          <div className="text-xs text-muted mb-1 flex items-center">
            <span>Realized Historical Probability</span>
            <InfoTooltip
              text="Empirical UP-win frequency in past markets in the same (time, BTC move) bucket. What the outcome actually was, measured after the fact."
            />
          </div>
          <UpDownSplit pUp={point.realized} />
          <div className="text-xs text-muted mt-0.5">the actual historical outcome</div>
        </div>
      </div>

      {/* ── Row 2: gaps (live deviations + historical calibration) ────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Live vs Historical Implied (behavior) */}
        <GapCard
          title="Live vs Historical Implied"
          tooltip="Live Implied minus Implied Historical, in percentage points. Shows whether this market is pricing UP like similar past markets, or unusually high or low. Large deviations can signal breaking news, a volume spike, or a thin order book."
          value={behaviorGap}
          style={behaviorStyle}
        />

        {/* Live vs Historical Realized - the gap that drives the verdict */}
        <GapCard
          title="Live vs Historical Realized"
          tooltip="Live Implied minus Realized Historical, in percentage points. A small gap means the live price agrees with the 9,181-market baseline, so the verdict says to follow the market. A large gap (above your edge threshold) means the price is off-baseline, and the verdict recommends betting against it."
          value={realityGap}
          style={realityStyle}
        />

        {/* Historical Calibration Gap */}
        <GapCard
          title="Historical Calibration Gap"
          tooltip="Implied Historical minus Realized Historical, in percentage points. Positive = past markets in this situation over-priced UP. Negative = past markets under-priced UP. Measures historical calibration quality, independent of the current live price."
          value={histGap}
          style={histStyle}
        />
      </div>

      {/* ── Verdict: live trading conclusion ─────────────────────────── */}
      {/* Collapsed bar is a single contiguous paragraph with inline coloured
          highlights on the key numbers (min-height keeps it stable across
          verdict states). Clicking expands a breakdown of the live
          calculations. Hidden entirely in "no-verdict" difficulty mode
          (showVerdict=false), along with the settings panel; rows 1 and 2
          stay visible. */}
      {showVerdict && (
        <>
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
              // Fixed min-height calibrated on the largest verdict layout
              // (the off-baseline branch with Kelly + variance both visible
              // adds two extra DetailRows). Smaller cases (calibrated → 3
              // rows, no data → 2 paragraphs) sit at the top with some
              // bottom whitespace - but the panel never jumps tick-to-tick
              // when the live gap crosses the threshold.
              <div className="border-t border-border/40 px-4 py-3 text-xs min-h-[26rem]">
                {verdict.details}
              </div>
            )}
          </div>

          {/* ── Verdict settings (sits just below the verdict so the user
              can tune sensitivity, Kelly, variance display without leaving
              the calibration block) ─────────────────────────────────── */}
          <VerdictSettingsPanel
            settings={settings}
            onChange={setSettings}
            expanded={settingsExpanded}
            onToggleExpanded={() => setSettingsExpanded(e => !e)}
          />
        </>
      )}

    </div>
  )
}
