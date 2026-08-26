/*
 * Turn an axios error from a DRF endpoint into something a form can render:
 *   { fields: { name_en: "This field is required." }, message: "…" }
 *
 * Never surfaces raw JSON or a stack trace. Ported from the JS version.
 */
import type { AxiosError } from 'axios'

export interface ParsedApiError {
  fields: Record<string, string>
  message: string
}

function flatten(value: unknown): string {
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${flatten(v)}`)
      .join('; ')
  }
  return value == null ? '' : String(value)
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function parseApiError(
  err: unknown,
  { fallback = 'Something went wrong. Please try again.' } = {},
): ParsedApiError {
  const axiosErr = err as AxiosError
  if (!axiosErr?.response) {
    return {
      fields: {},
      message: 'Could not reach the server. Check your connection and retry.',
    }
  }

  const data = axiosErr.response.data
  if (typeof data === 'string') return { fields: {}, message: data || fallback }
  if (!data || typeof data !== 'object') return { fields: {}, message: fallback }

  const fields: Record<string, string> = {}
  const messages: string[] = []

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === 'detail' || key === 'non_field_errors') {
      messages.push(flatten(value))
      continue
    }
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      fields[key] = value.join(' ')
      continue
    }
    const flat = flatten(value)
    if (flat) messages.push(`${humanize(key)}: ${flat}`)
  }

  return {
    fields,
    message:
      messages.filter(Boolean).join(' · ') ||
      (Object.keys(fields).length ? '' : fallback),
  }
}
