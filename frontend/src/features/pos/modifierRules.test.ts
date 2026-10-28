import { describe, expect, it } from 'vitest'

import { boundsFor, pickRule, ruleIssues, selectionFor, suggestedRule } from './modifierRules'

describe('modifierRules (mirror of modifier_rules.py)', () => {
  it('reads a stored min/max as a preset', () => {
    expect(pickRule(1, 1)).toBe('exactly')
    expect(pickRule(3, 3)).toBe('exactly')
    expect(pickRule(0, 1)).toBe('optional_one')
    expect(pickRule(0, 4)).toBe('up_to')
    expect(pickRule(0, null)).toBe('any')
    expect(pickRule(1, 3)).toBe('range')
  })

  it('round-trips presets to bounds', () => {
    const range = { min: 1, max: 3 }
    expect(boundsFor('exactly', 2, range)).toEqual({ min: 2, max: 2 })
    expect(boundsFor('up_to', 4, range)).toEqual({ min: 0, max: 4 })
    expect(boundsFor('any', 9, range)).toEqual({ min: 0, max: null })
    expect(boundsFor('range', 9, range)).toEqual(range)
    expect(selectionFor(1)).toBe('single')
    expect(selectionFor(null)).toBe('multi')
  })

  it('suggests from option kinds', () => {
    expect(suggestedRule([])).toBeNull()
    expect(suggestedRule(['choice', 'type'])?.rule).toBe('exactly')
    expect(suggestedRule(['addon', 'instruction'])?.rule).toBe('any')
  })

  it('flags a pick-one group that mixes questions', () => {
    expect(ruleIssues(1, 1, ['type', 'addon', 'instruction'])).toEqual([
      { code: 'mixed_single_pick', families: ['pick', 'extra', 'instruction'] },
    ])
    expect(ruleIssues(1, 1, ['choice', 'type'])).toEqual([])
    expect(ruleIssues(0, null, ['type', 'addon'])).toEqual([])
    expect(ruleIssues(3, 3, ['choice'])[0].code).toBe('min_over_options')
  })
})
