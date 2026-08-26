import { useEffect, useRef, useState } from 'react'

/*
 * Counts a number up to its value once, on mount. For KPI figures and any
 * headline metric — the value arriving feels earned rather than just there.
 * Respects prefers-reduced-motion (renders the final value immediately) and
 * only animates the first time a given `value` mounts.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const animates = Number.isFinite(value) && !prefersReducedMotion()
  const [display, setDisplay] = useState(() => (animates ? 0 : value))
  const frame = useRef<number>(0)

  useEffect(() => {
    if (!animates) return
    let start: number | null = null
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, (now - start) / duration)
      // easeOutQuart — quick to arrive, gentle to settle
      const eased = 1 - Math.pow(1 - t, 4)
      setDisplay(value * eased)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value, duration, animates])

  const text =
    prefix +
    display.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) +
    suffix

  return (
    <span className={className} aria-label={prefix + value + suffix}>
      {text}
    </span>
  )
}
