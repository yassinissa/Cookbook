/*
 * Turn an axios error from a DRF endpoint into something the form can render:
 *   { fields: { name_en: "This field is required." }, message: "…" }
 *
 * DRF shapes handled:
 *   { field: ["msg", "msg2"] }            -> fields[field]
 *   { non_field_errors: ["msg"] }         -> message
 *   { detail: "msg" }                     -> message
 *   { ingredients: [{}, { unit: ["…"] }] }-> message ("Ingredient 2: …")
 *   a string body                         -> message
 *   no response (network / CORS)          -> message
 */
function flatten(value) {
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${flatten(v)}`)
      .join('; ')
  }
  return value == null ? '' : String(value)
}

export function parseApiError(err, { fallback = 'Something went wrong. Please try again.' } = {}) {
  if (!err?.response) {
    return { fields: {}, message: 'Could not reach the server. Check your connection and retry.' }
  }

  const data = err.response.data
  if (typeof data === 'string') return { fields: {}, message: data || fallback }
  if (!data || typeof data !== 'object') return { fields: {}, message: fallback }

  const fields = {}
  const messages = []

  for (const [key, value] of Object.entries(data)) {
    if (key === 'detail' || key === 'non_field_errors') {
      messages.push(flatten(value))
      continue
    }
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      fields[key] = value.join(' ')
      continue
    }
    // nested list of objects (e.g. ingredients) or a nested object
    const flat = flatten(value)
    if (flat) messages.push(`${humanize(key)}: ${flat}`)
  }

  return {
    fields,
    message: messages.filter(Boolean).join(' · ') || (Object.keys(fields).length ? '' : fallback),
  }
}

function humanize(key) {
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
