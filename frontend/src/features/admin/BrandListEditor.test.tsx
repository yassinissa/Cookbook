import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { I18nProvider } from '@/i18n'
import { BrandListEditor, type ListItem } from './BrandListEditor'

const ITEMS: ListItem[] = [
  { id: 'c1', label: 'Burger', labelAr: 'البيرغر' },
  { id: 'c2', label: 'Panini' },
  { id: 'c3', label: 'Salad' },
]

function Harness({ initial, onAdd, canAdd = true }: { initial: string[]; onAdd?: (n: string, a: string) => Promise<ListItem>; canAdd?: boolean }) {
  const [items, setItems] = useState(ITEMS)
  const [selected, setSelected] = useState(initial)
  return (
    <I18nProvider>
      <BrandListEditor
        title="Menu categories"
        items={items}
        selected={selected}
        onChange={setSelected}
        onAdd={async (n, a) => {
          const item = await (onAdd ?? (async () => ({ id: 'new', label: n })))(n, a)
          setItems((xs) => [...xs, item])
          return item
        }}
        withArabic
        canAdd={canAdd}
      />
      <output data-testid="selected">{selected.join(',')}</output>
    </I18nProvider>
  )
}

const selected = () => screen.getByTestId('selected').textContent

describe('BrandListEditor', () => {
  it('starts on the shared list when the brand has none, and switching to own shows the chips', async () => {
    render(<Harness initial={[]} />)
    expect(screen.queryByRole('button', { name: /Burger/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Own list' }))
    await userEvent.click(screen.getByRole('button', { name: /Panini/ }))
    expect(screen.getByRole('button', { name: /Panini/ })).toHaveAttribute('aria-pressed', 'true')
    expect(selected()).toBe('c2')
  })

  it('shared clears the list, and own brings the previous picks back', async () => {
    render(<Harness initial={['c1', 'c2']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Shared list' }))
    expect(selected()).toBe('')
    await userEvent.click(screen.getByRole('button', { name: 'Own list' }))
    expect(selected()).toBe('c1,c2')
  })

  it('adds a new item and ticks it', async () => {
    const onAdd = vi.fn(async (n: string, a: string) => ({ id: 'c9', label: n, labelAr: a }))
    render(<Harness initial={['c1']} onAdd={onAdd} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Name (EN)' }), 'Wraps')
    await userEvent.type(screen.getByRole('textbox', { name: 'Name (AR)' }), 'لفائف')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('Wraps', 'لفائف')
    expect(selected()).toBe('c1,c9')
    expect(screen.getByRole('button', { name: /Wraps/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the add error and keeps the list unchanged', async () => {
    render(<Harness initial={['c1']} onAdd={async () => { throw new Error('Name already exists.') }} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Name (EN)' }), 'Burger')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name already exists.')
    expect(selected()).toBe('c1')
  })

  it('an unsaved brand cannot add new items', () => {
    render(<Harness initial={['c1']} canAdd={false} />)
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  })
})
