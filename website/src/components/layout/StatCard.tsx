/**
 * Single animated counter card. The number eases from 0 to its target on
 * mount; `delay` lets the parent stagger neighbouring cards.
 *
 * The animation runs once per mount and once per target change. We use
 * `Math.round` for integers and `toFixed` for decimals to keep the digit
 * width stable (the `tabular-nums` Tailwind utility further locks layout).
 */
import { useEffect, useRef, useState } from 'react'

interface Props {
  value:     number
  label:     string
  prefix?:   string
  suffix?:   string
  decimals?: number
  delay?:    number
  duration?: number
}

function useCountUp(target: number, duration: number, delay: number): number {
  const [count, setCount] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        setCount(eased * target)
        if (t < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }, delay)
    return () => {
      clearTimeout(timeout)
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay])

  return count
}

export default function StatCard({
  value,
  label,
  prefix   = '',
  suffix   = '',
  decimals = 0,
  delay    = 0,
  duration = 1800,
}: Props) {
  const count = useCountUp(value, duration, delay)
  const formatted = decimals > 0
    ? count.toFixed(decimals)
    : Math.round(count).toLocaleString()

  return (
    <div className="flex flex-col items-center gap-2 py-8 px-6 text-center">
      <span className="text-4xl font-bold tracking-tight text-white tabular-nums">
        {prefix}{formatted}{suffix}
      </span>
      <span className="text-sm text-muted leading-snug">{label}</span>
    </div>
  )
}
