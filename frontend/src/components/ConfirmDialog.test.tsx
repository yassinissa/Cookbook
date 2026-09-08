import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ConfirmDialog } from './ConfirmDialog'
import { I18nProvider } from '@/i18n'

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>)

function open(extra: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  wrap(
    <ConfirmDialog
      open
      title="Delete recipe"
      body="This can't be undone."
      confirmLabel="Delete"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...extra}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('is a labelled, described modal dialog', () => {
    open()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Delete recipe')
    expect(dialog).toHaveAccessibleDescription("This can't be undone.")
  })

  it('focuses the confirm button on open', () => {
    open()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const { onCancel } = open()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('keeps Tab focus inside the dialog', async () => {
    open()
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    for (let i = 0; i < 4; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})
