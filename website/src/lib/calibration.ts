// Lookup table + bilinear interpolation for the playground calibration panel.
//
// The lookup is produced by scripts/export_calibration_lookup.py and contains
// 2D grids of P(UP | time_remaining, btc_pct_change) - both the empirical
// `realized` value and the market-implied historical average.

export interface CalibrationLookup {
  version: number
  n_total_markets: number
  n_min_samples: number
  t_grid: number[]                       // seconds, ascending
  y_grid: number[]                       // percentage points, ascending
  smoothing: { sigma_t: number; sigma_y: number }
  realized: (number | null)[][]          // [t_idx][y_idx]
  implied: (number | null)[][]           // [t_idx][y_idx]
  n_samples: number[][]                  // [t_idx][y_idx] - raw, unsmoothed
}

export type Confidence = 'high' | 'medium' | 'low' | 'none'

export interface CalibrationPoint {
  realized: number | null
  implied: number | null
  gap: number | null                     // implied - realized
  n: number                              // min n_samples of the 4 surrounding cells
  confidence: Confidence
}

const EMPTY_POINT: CalibrationPoint = {
  realized: null,
  implied: null,
  gap: null,
  n: 0,
  confidence: 'none',
}

// Binary-search-like locate: returns the index `i` such that
// grid[i] <= x < grid[i+1]. Clamped to [0, grid.length - 2].
function locate(grid: number[], x: number): number {
  if (grid.length < 2) return 0
  if (x <= grid[0]) return 0
  if (x >= grid[grid.length - 1]) return grid.length - 2

  let lo = 0
  let hi = grid.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (grid[mid] <= x) lo = mid
    else hi = mid
  }
  return lo
}

function classify(n: number): Confidence {
  if (n >= 100) return 'high'
  if (n >= 30) return 'medium'
  if (n > 0) return 'low'
  return 'none'
}

// Bilinear interpolation over the 4 cells surrounding (t, y).
// Returns null if any of the 4 cells is null (no synthetic extrapolation).
function bilinear(
  grid: (number | null)[][],
  ti: number,
  yi: number,
  tFrac: number,
  yFrac: number,
): number | null {
  const a = grid[ti]?.[yi]
  const b = grid[ti]?.[yi + 1]
  const c = grid[ti + 1]?.[yi]
  const d = grid[ti + 1]?.[yi + 1]
  if (a == null || b == null || c == null || d == null) return null

  const top = a * (1 - yFrac) + b * yFrac
  const bot = c * (1 - yFrac) + d * yFrac
  return top * (1 - tFrac) + bot * tFrac
}

export function lookupCalibration(
  table: CalibrationLookup,
  timeRemaining: number,
  btcPctChange: number,
): CalibrationPoint {
  if (!table || !table.t_grid?.length || !table.y_grid?.length) return EMPTY_POINT

  const ti = locate(table.t_grid, timeRemaining)
  const yi = locate(table.y_grid, btcPctChange)

  const t0 = table.t_grid[ti]
  const t1 = table.t_grid[ti + 1]
  const y0 = table.y_grid[yi]
  const y1 = table.y_grid[yi + 1]

  const tSpan = t1 - t0
  const ySpan = y1 - y0
  const tFrac = tSpan > 0 ? Math.min(1, Math.max(0, (timeRemaining - t0) / tSpan)) : 0
  const yFrac = ySpan > 0 ? Math.min(1, Math.max(0, (btcPctChange - y0) / ySpan)) : 0

  const realized = bilinear(table.realized, ti, yi, tFrac, yFrac)
  const implied = bilinear(table.implied, ti, yi, tFrac, yFrac)

  const n = Math.min(
    table.n_samples[ti]?.[yi] ?? 0,
    table.n_samples[ti]?.[yi + 1] ?? 0,
    table.n_samples[ti + 1]?.[yi] ?? 0,
    table.n_samples[ti + 1]?.[yi + 1] ?? 0,
  )

  const gap = realized != null && implied != null ? implied - realized : null
  const confidence: Confidence =
    realized == null || implied == null ? 'none' : classify(n)

  return { realized, implied, gap, n, confidence }
}
