// Pure geometry helpers for the playground price chart.

// SVG path that gracefully skips null points (creates gaps in the line).
export function buildPath(points: { x: number; y: number | null }[]): string {
  let out = ''
  let lastValid = false
  for (const p of points) {
    if (p.y == null) {
      lastValid = false
    } else {
      out += `${lastValid ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `
      lastValid = true
    }
  }
  return out.trim()
}

// Distribute label y-positions so consecutive ones are ≥ minGap apart,
// clamped inside [lo, hi]. Preserves the input order.
export function distributeLabels(positions: number[], minGap: number, lo: number, hi: number): number[] {
  if (positions.length === 0) return []
  const sorted = positions.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k].y - sorted[k - 1].y < minGap) {
      sorted[k].y = sorted[k - 1].y + minGap
    }
  }
  if (sorted[sorted.length - 1].y > hi) {
    const shift = sorted[sorted.length - 1].y - hi
    for (const it of sorted) it.y -= shift
  }
  if (sorted[0].y < lo) {
    const shift = lo - sorted[0].y
    for (const it of sorted) it.y += shift
  }
  const result = positions.slice()
  for (const it of sorted) result[it.i] = it.y
  return result
}
