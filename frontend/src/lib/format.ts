/*
 * Formatting — currency, numbers, percentages, dates.
 *
 * KWD shows 3 decimal places (fils). Digits are forced to Latin (`latn`) even
 * in Arabic so columns of figures still line up under the mono font; the
 * surrounding words localise, the numbers stay comparable.
 */

const DASH = '—'

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(n) ? null : n
}

/** Bare KWD amount to 3dp, e.g. "0.752". No currency word — callers add "KWD". */
export function kwd(value: unknown, dash = DASH): string {
  const n = toNumber(value)
  if (n === null) return dash
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

/** KWD with the currency label, for standalone display. */
export function kwdLabelled(value: unknown, dash = DASH): string {
  const n = toNumber(value)
  return n === null ? dash : `${kwd(n)} KWD`
}

export function percent(value: unknown, digits = 1, dash = DASH): string {
  const n = toNumber(value)
  return n === null ? dash : `${n.toFixed(digits)}%`
}

export function number(value: unknown, digits = 0, dash = DASH): string {
  const n = toNumber(value)
  if (n === null) return dash
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function shortDate(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return DASH
  return d.toLocaleDateString(locale === 'ar' ? 'ar-KW-u-ca-gregory-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function dateTime(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return DASH
  return d.toLocaleString(locale === 'ar' ? 'ar-KW-u-ca-gregory-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "3 days ago" / "just now" — compact relative time for activity feeds. */
export function relativeTime(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return DASH
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return DASH
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en', { numeric: 'auto' })
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute')
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return rtf.format(-days, 'day')
  const months = Math.round(days / 30)
  return rtf.format(-months, 'month')
}

/** Food-cost % band — restaurant norm is a 30% target. */
export type FoodCostBand = 'healthy' | 'watch' | 'high'

export function foodCostBand(pct: unknown): FoodCostBand | null {
  const n = toNumber(pct)
  if (n === null) return null
  if (n <= 30) return 'healthy'
  if (n <= 38) return 'watch'
  return 'high'
}
