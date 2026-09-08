import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'

import { OfflineBanner } from './OfflineBanner'
import { I18nProvider } from '@/i18n'

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  vi.restoreAllMocks()
})

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>)

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    setOnline(true)
    wrap(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the strip when offline at mount', () => {
    setOnline(false)
    wrap(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i)
  })

  it('reacts to the online / offline events', () => {
    setOnline(true)
    wrap(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
