import { describe, expect, it } from 'vitest'

import { brandOptions, hasBrandList } from './brandOptions'

const items = [
  { id: 'salad', branch_ids: [] },
  { id: 'mains' },
  { id: 'burger', branch_ids: ['sando'] },
  { id: 'panini', branch_ids: ['sando', 'luma'] },
]
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('brandOptions', () => {
  it('gives a brand with its own list only that list', () => {
    expect(hasBrandList(items, 'sando')).toBe(true)
    expect(ids(brandOptions(items, 'sando'))).toEqual(['burger', 'panini'])
  })

  it('gives a brand without a list the unassigned items', () => {
    expect(hasBrandList(items, 'wnr')).toBe(false)
    expect(ids(brandOptions(items, 'wnr'))).toEqual(['salad', 'mains'])
    expect(ids(brandOptions(items, ''))).toEqual(['salad', 'mains'])
  })

  it('keeps the value a dish was saved with', () => {
    expect(ids(brandOptions(items, 'sando', 'salad'))).toEqual(['salad', 'burger', 'panini'])
  })
})
