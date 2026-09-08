import '@testing-library/jest-dom/vitest'

import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom doesn't implement these; the design system reads matchMedia for
// prefers-reduced-motion and several primitives observe resize/intersection.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
window.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver
window.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver
