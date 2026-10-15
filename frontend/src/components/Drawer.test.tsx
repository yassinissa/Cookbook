import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { I18nProvider } from '@/i18n'
import { Drawer } from './Drawer'

function Harness() {
  const [n, setN] = useState(0)
  return (
    <I18nProvider>
      <Drawer open title="Edit" onClose={() => undefined /* a new arrow every render */}>
        <input aria-label="First" />
        <input aria-label="Second" />
        <button type="button" onClick={() => setN((x) => x + 1)}>
          Re-render parent {n}
        </button>
      </Drawer>
    </I18nProvider>
  )
}

describe('Drawer', () => {
  it('focuses the first field when it opens', () => {
    render(<Harness />)
    expect(screen.getByRole('textbox', { name: 'First' })).toHaveFocus()
  })

  it('does not steal focus back when the parent re-renders', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('textbox', { name: 'Second' }))
    await userEvent.click(screen.getByRole('button', { name: /Re-render parent/ }))
    expect(screen.getByRole('button', { name: /Re-render parent 1/ })).toHaveFocus()
  })
})
