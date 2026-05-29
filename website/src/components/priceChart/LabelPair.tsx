// Stacked main / sub label group rendered at the right edge of the chart
// for each visible series' current value.

interface Props {
  cx: number
  cy: number
  color: string
  main: string
  sub: string
}

export default function LabelPair({ cx, cy, color, main, sub }: Props) {
  return (
    <g>
      <text x={cx} y={cy - 2} fontSize={11} fontWeight="600" fill={color}>{main}</text>
      <text x={cx} y={cy + 10} fontSize={9} fill={color} opacity={0.75}>{sub}</text>
    </g>
  )
}
