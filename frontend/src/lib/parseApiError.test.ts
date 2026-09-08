import { describe, it, expect, afterEach, vi } from 'vitest'

import { parseApiError } from './parseApiError'

afterEach(() => {
  vi.restoreAllMocks()
})

function axiosLike(status: number, data: unknown) {
  return { response: { status, data } } as unknown
}

describe('parseApiError', () => {
  it('reports a connection problem when there is no response', () => {
    const { fields, message } = parseApiError(new Error('Network Error'))
    expect(fields).toEqual({})
    expect(message).toMatch(/could not reach the server/i)
  })

  it('reports an offline save when navigator is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(parseApiError(new Error('Network Error')).message).toMatch(/you're offline/i)
  })

  it('maps DRF field errors to the fields map', () => {
    const { fields, message } = parseApiError(
      axiosLike(400, { name_en: ['This field is required.'], price: ['A valid number is required.'] }),
    )
    expect(fields.name_en).toBe('This field is required.')
    expect(fields.price).toBe('A valid number is required.')
    expect(message).toBe('')
  })

  it('surfaces detail / non_field_errors as the message', () => {
    expect(parseApiError(axiosLike(403, { detail: 'You do not have permission.' })).message).toBe(
      'You do not have permission.',
    )
    expect(
      parseApiError(axiosLike(400, { non_field_errors: ['Dates overlap an existing period.'] })).message,
    ).toBe('Dates overlap an existing period.')
  })

  it('humanises nested / non-array errors into the message', () => {
    const { message } = parseApiError(axiosLike(400, { lines: { 0: { qty: ['Must be positive.'] } } }))
    expect(message).toMatch(/Lines:/)
    expect(message).toMatch(/Must be positive/)
  })

  it('passes a plain string body through', () => {
    expect(parseApiError(axiosLike(500, 'Server exploded')).message).toBe('Server exploded')
  })

  it('falls back when the body is unusable', () => {
    expect(parseApiError(axiosLike(500, null)).message).toMatch(/something went wrong/i)
  })
})
