import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { I18nProvider } from '@/i18n'
import type { RecipeChangeEntry } from '@/types/api'
import { ChangeEntry } from './ChangeEntry'

const line = (over = {}) => ({
  item_sku: 'B72', item_name_snapshot: 'Parsley', prep_note: 'Chopped', quantity: '75.000', unit: 'g', ...over,
})

const entry = (over: Partial<RecipeChangeEntry> = {}): RecipeChangeEntry => ({
  id: '1', kind: 'dish', action: 'updated', action_display: 'Updated', description: '',
  recipe_id: 'r1', recipe_name: 'Tabbouleh', recipe_name_ar: '', recipe_code: '1076.9',
  recipe_path: '/recipes/dishes/r1', scope_name: 'Salmiya',
  changed_by: 'nadia', changed_by_name: 'Nadia Haddad', created_at: '2026-10-01T09:00:00Z',
  version: 2, is_new_version: true, changes_reconstructed: false,
  changes: {
    fields: [{ field: 'selling_price', from: '2.900', to: '3.500' }],
    ingredients: {
      added: [line({ item_sku: 'B13', item_name_snapshot: 'Sea salt', prep_note: '', quantity: '4' })],
      removed: [],
      changed: [{ label: 'B72', from: line(), to: line({ quantity: '90.000' }), changed: ['quantity'] }],
    },
    steps: { added: [], removed: [], changed: [], count_from: 2, count_to: 2 },
  },
  summary: {
    fields_changed: ['selling_price'], ingredients_added: 1, ingredients_removed: 0,
    ingredients_changed: 1, steps_added: 0, steps_removed: 0, steps_changed: 0,
  },
  ...over,
})

const wrap = (e: RecipeChangeEntry, props = {}) =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <ol>
          <ChangeEntry e={e} {...props} />
        </ol>
      </I18nProvider>
    </MemoryRouter>,
  )

describe('ChangeEntry', () => {
  it('names the recipe, the person and a readable summary', () => {
    wrap(entry())
    expect(screen.getByRole('link', { name: 'Tabbouleh' })).toHaveAttribute('href', '/recipes/dishes/r1')
    expect(screen.getByText('Nadia Haddad')).toBeInTheDocument()
    expect(screen.getByText(/New version · v2/)).toBeInTheDocument()
    expect(screen.getByText('Ingredients: 1 added, 1 changed · Selling price')).toBeInTheDocument()
  })

  it('itemises the before and after once expanded', async () => {
    wrap(entry())
    expect(screen.queryByText('90 g')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('75 g')).toBeInTheDocument()
    expect(screen.getByText('90 g')).toBeInTheDocument()
    expect(screen.getByText('Sea salt')).toBeInTheDocument()
    expect(screen.getByText('2.900 KWD')).toBeInTheDocument()
    expect(screen.getByText('3.500 KWD')).toBeInTheDocument()
  })

  it('labels a non-version edit as an adjustment', () => {
    wrap(entry({ is_new_version: false, version: 1 }))
    expect(screen.getByText('Adjustment')).toBeInTheDocument()
    expect(screen.queryByText(/New version/)).not.toBeInTheDocument()
  })

  it('offers no disclosure when nothing was itemised', () => {
    wrap(entry({ action: 'published', action_display: 'Published to inventory', is_new_version: false, changes: null }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Published to inventory')).toBeInTheDocument()
  })
})
