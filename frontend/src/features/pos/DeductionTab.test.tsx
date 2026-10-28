import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { I18nProvider } from '@/i18n'
import { ToastProvider } from '@/components/Toast'
import type { DeductionIssue, DeductionIssues } from '@/types/api'

const base: Omit<DeductionIssue, 'code' | 'side' | 'status' | 'fix' | 'target' | 'retryable'> = {
  level: 'error', brand: 'dine', item: null, pos_item_name: 'BURRITO', pos_modifier: '',
  from_unit: null, to_unit: null, message: 'inventory saw a problem', inventory_fix: 'inventory fix text',
  branches: ['Dine Salmiya'], lines: ['BURRITO x2'], imports: [{ id: 'i1', date: '2026-10-27', branch: 'Dine Salmiya' }],
  occurrences: 3, qty_sold: 6, first_date: '2026-10-26', last_date: '2026-10-27',
}
const DATA: DeductionIssues = {
  days: 14, since: '2026-10-14', checked_at: new Date().toISOString(),
  imports_scanned: 5, imports_with_issues: 2,
  summary: { cookbook: 2, inventory: 1, expected: 0 },
  issues: [
    { ...base, code: 'modifier_not_modelled', level: 'warning', pos_modifier: 'NO ONION', side: 'cookbook',
      status: 'option_missing', retryable: false, fix: 'Put that exact text in the option.',
      target: { type: 'dish_modifiers', id: 'd1', label: 'Burrito', path: '/pos?tab=dishes&dish=d1' } },
    { ...base, code: 'no_recipe', side: 'cookbook', status: 'dish_unpublished', retryable: true,
      fix: 'Publish it.', target: { type: 'dish', id: 'd1', label: 'Burrito', path: '/recipes/dishes/d1' } },
    { ...base, code: 'insufficient_stock', side: 'inventory', status: 'stock_short', retryable: true,
      pos_item_name: '', item: 'Tortilla', fix: 'Dispatch Tortilla.', target: null },
  ],
}
const fetchDeductionIssues = vi.fn(async () => DATA)
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), fetchDeductionIssues: () => fetchDeductionIssues() }))

const { DeductionTab } = await import('./DeductionTab')

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ToastProvider>
          <MemoryRouter>
            <DeductionTab />
          </MemoryRouter>
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('DeductionTab', () => {
  it('shows Cookbook-side causes first, each with where to fix it', async () => {
    renderTab()
    expect(await screen.findByText('BURRITO [NO ONION]')).toBeInTheDocument()
    expect(screen.getByText('No option with this POS text')).toBeInTheDocument()
    expect(screen.getByText('Dish not published')).toBeInTheDocument()
    expect(screen.queryByText('Tortilla')).not.toBeInTheDocument()       // inventory side, filtered out

    const links = screen.getAllByRole('link', { name: /Open Burrito/ })
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/pos?tab=dishes&dish=d1', '/recipes/dishes/d1'])
    // a skipped modifier only affects future sales; an unmatched dish can be re-applied
    expect(screen.getByText(/applies to future sales/)).toBeInTheDocument()
    expect(screen.getByText(/press Re-apply/)).toBeInTheDocument()
  })

  it('filters to the inventory side', async () => {
    renderTab()
    await screen.findByText('BURRITO [NO ONION]')
    await userEvent.click(screen.getByRole('tab', { name: /Inventory side/ }))
    expect(screen.getByText('Tortilla')).toBeInTheDocument()
    expect(screen.getByText('Not enough stock')).toBeInTheDocument()
    expect(screen.queryByText('BURRITO [NO ONION]')).not.toBeInTheDocument()
  })
})
