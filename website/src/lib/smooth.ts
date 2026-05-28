/**
 * Catmull-Rom → cubic Bezier path builder.
 *
 * Given an array of {x, y} anchors, returns an SVG path string ("M … C …")
 * that passes through every point with smooth tangents estimated from the
 * neighbour on either side (clamped at the endpoints). Used by every line
 * chart on the site so the smoothing behaves identically everywhere.
 */
export interface Pt { x: number; y: number }

export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} `
      +   `${c2x.toFixed(1)},${c2y.toFixed(1)} `
      +   `${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}
