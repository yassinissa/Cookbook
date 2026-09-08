import { describe, it, expect } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false && 'b', null, undefined, 'c')).toBe('a c')
  })

  it('supports the clsx object and array forms', () => {
    expect(cn({ a: true, b: false }, ['c', 'd'])).toBe('a c d')
  })
})
