const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/**
 * Keep Tab focus inside `container` for a modal. Call from a `keydown` handler
 * on `e.key === 'Tab'`.
 */
export function trapTab(e: KeyboardEvent, container: HTMLElement | null): void {
  const items = focusableWithin(container)
  if (items.length === 0) {
    e.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const activeInside = container?.contains(document.activeElement)
  if (e.shiftKey && (document.activeElement === first || !activeInside)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (document.activeElement === last || !activeInside)) {
    e.preventDefault()
    first.focus()
  }
}
