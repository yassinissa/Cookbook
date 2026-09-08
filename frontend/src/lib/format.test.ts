import { describe, it, expect } from 'vitest'

import {
  kwd,
  kwdLabelled,
  percent,
  number,
  shortDate,
  relativeTime,
  foodCostBand,
} from './format'

describe('kwd', () => {
  it('formats to 3 decimal places (fils)', () => {
    expect(kwd(0.7516540)).toBe('0.752')
    expect(kwd(2)).toBe('2.000')
    expect(kwd('1.5')).toBe('1.500')
  })

  it('returns the dash for nullish / non-numeric input', () => {
    expect(kwd(null)).toBe('—')
    expect(kwd(undefined)).toBe('—')
    expect(kwd('')).toBe('—')
    expect(kwd('abc')).toBe('—')
  })

  it('honours a custom dash', () => {
    expect(kwd(null, 'n/a')).toBe('n/a')
  })
})

describe('kwdLabelled', () => {
  it('appends the currency word', () => {
    expect(kwdLabelled(0.752)).toBe('0.752 KWD')
  })
  it('dashes on null without a stray label', () => {
    expect(kwdLabelled(null)).toBe('—')
  })
})

describe('percent', () => {
  it('fixes to the given digits with a % sign', () => {
    expect(percent(25.925)).toBe('25.9%')
    expect(percent(30, 0)).toBe('30%')
  })
  it('dashes on null', () => {
    expect(percent(null)).toBe('—')
  })
})

describe('number', () => {
  it('groups thousands', () => {
    expect(number(12345)).toBe('12,345')
  })
  it('keeps requested decimals', () => {
    expect(number(3.5, 2)).toBe('3.50')
  })
})

describe('shortDate', () => {
  it('formats an ISO date', () => {
    // "Sep" in a browser, "Sept" under Node's ICU — assert on the stable parts.
    expect(shortDate('2026-09-08T10:00:00Z')).toMatch(/^8 Sept? 2026$/)
  })
  it('dashes on empty or invalid input', () => {
    expect(shortDate(null)).toBe('—')
    expect(shortDate('not-a-date')).toBe('—')
  })
})

describe('relativeTime', () => {
  it('reports minutes for a recent timestamp', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(relativeTime(fiveMinAgo)).toMatch(/minute/)
  })
  it('dashes on invalid input', () => {
    expect(relativeTime('nope')).toBe('—')
  })
})

describe('foodCostBand', () => {
  it('bands against the 30% target', () => {
    expect(foodCostBand(25)).toBe('healthy')
    expect(foodCostBand(30)).toBe('healthy')
    expect(foodCostBand(35)).toBe('watch')
    expect(foodCostBand(38)).toBe('watch')
    expect(foodCostBand(45)).toBe('high')
  })
  it('returns null when there is no number', () => {
    expect(foodCostBand(null)).toBeNull()
    expect(foodCostBand('x')).toBeNull()
  })
})
