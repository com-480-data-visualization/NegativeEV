// Small number formatters shared across the playground subtree.

export function fmt(n: number, d = 2): string {
  return n.toFixed(d)
}

export function fmtUSD(n: number): string {
  const s = Math.abs(n).toFixed(2)
  return (n >= 0 ? '+$' : '-$') + s
}
