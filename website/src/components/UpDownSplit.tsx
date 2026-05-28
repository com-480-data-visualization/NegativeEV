// Two complementary probabilities (P(UP), 1 - P(UP)) shown side-by-side,
// color-coded green/red with directional arrows. Used in both the live
// implied card (Live market) and the historical cards (Historical Prediction Insight).

interface Props {
  pUp: number | null
}

const fmtPct = (v: number | null) => v == null ? '-' : `${(v * 100).toFixed(1)}%`

export default function UpDownSplit({ pUp }: Props) {
  if (pUp == null) {
    return <div className="text-xl font-bold text-white tabular-nums">-</div>
  }
  const pDown = 1 - pUp
  return (
    <div className="flex items-baseline gap-4">
      <div className="flex items-baseline gap-1 text-green-400">
        <span className="text-sm leading-none">↑</span>
        <span className="text-xl font-bold tabular-nums">{fmtPct(pUp)}</span>
      </div>
      <div className="flex items-baseline gap-1 text-red-400">
        <span className="text-sm leading-none">↓</span>
        <span className="text-xl font-bold tabular-nums">{fmtPct(pDown)}</span>
      </div>
    </div>
  )
}
