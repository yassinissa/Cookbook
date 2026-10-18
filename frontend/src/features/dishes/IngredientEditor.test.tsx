import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { I18nProvider } from '@/i18n'
import type { CostPreview } from '@/types/api'

vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ can: () => true }) }))

const PREVIEW: CostPreview = {
  items: '0.098',
  waste: '0.010',
  per_serving: '0.108',
  inventory_reachable: true,
  lines: [
    {
      sku: 'B2050', quantity: '2', unit: 'Tbs', amount: '0.0975', status: 'ok', detail: '',
      price: { per_unit: '0.003250', unit: 'ml', source: 'cookbook' },
      base_qty: '30',
      conversion: { text: '1 Tbs = 15 ml', source: 'item' },
      stock: { unit: 'ltr', qty: '0.03', problem: null },
    },
    {
      sku: 'B470', quantity: '10', unit: 'g', amount: '0.0050', status: 'ok', detail: '',
      price: { per_unit: '0.000500', unit: 'g', source: 'cookbook' },
      base_qty: '10', conversion: null,
      stock: { unit: 'pkt', qty: null, problem: 'set how much one PKT holds' },
    },
  ],
}
const previewCost = vi.fn(async () => PREVIEW)
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), previewCost: () => previewCost() }))

const { IngredientEditor } = await import('./IngredientEditor')

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rows = [
    { item_sku: 'B2050', item_name_snapshot: 'Oil', prep_note: '', quantity: '2', unit: 'u-tbs' },
    { item_sku: 'B470', item_name_snapshot: 'Salt', prep_note: '', quantity: '10', unit: 'u-g' },
  ]
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <IngredientEditor
          ingredients={rows}
          units={[]}
          items={[]}
          wastePct="10"
          onChange={() => undefined}
          onAdd={() => undefined}
          onRemove={() => undefined}
        />
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('IngredientEditor live cost', () => {
  it('shows each unsaved row’s cost and the running total', async () => {
    renderEditor()
    // row 1's chip (0.0975 → 0.098) and the ingredients total
    expect(await screen.findAllByText(/^0.098/, {}, { timeout: 2000 })).toHaveLength(2)
    expect(screen.getByText(/^0.005/)).toBeInTheDocument()
    expect(screen.getByText(/^0.108/)).toBeInTheDocument()
    expect(previewCost).toHaveBeenCalled()
  })

  it('expands a row to the working — conversion, sum and stock deduction', async () => {
    renderEditor()
    const [first, second] = await screen.findAllByRole('button', { name: /Show how this cost/ }, { timeout: 2000 })
    await userEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('1 Tbs = 15 ml')).toBeInTheDocument()
    expect(screen.getByText(/2 Tbs = 30 ml × 0.00325 =/)).toBeInTheDocument()
    expect(screen.getByText(/0.03 LTR/)).toBeInTheDocument()

    await userEvent.click(second)
    expect(screen.getByText(/Publishing will refuse this line: set how much one PKT holds/)).toBeInTheDocument()
  })
})
