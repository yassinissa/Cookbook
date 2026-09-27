import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { I18nProvider } from '@/i18n'
import { ToastProvider } from '@/components/Toast'
import * as api from '@/lib/api'
import { ItemMeasuresSection } from './ItemSupplementPanels'

vi.mock('@/lib/api', () => ({
  fetchItemConversion: vi.fn(),
  fetchReference: vi.fn(),
  saveItemConversion: vi.fn(),
}))

const UNITS = ['g', 'ml', 'Kg', 'Ltr', 'Pc', 'Tbs'].map((code) => ({
  id: `u-${code}`, code, description: code, dimension: '', factor_to_canonical: '1',
}))

function renderSection(stockUnit: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ToastProvider>
          <ItemMeasuresSection sku="DUNE" stockUnit={stockUnit} />
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('ItemMeasuresSection', () => {
  beforeEach(() => {
    vi.mocked(api.fetchReference).mockResolvedValue({ units: UNITS } as never)
    vi.mocked(api.saveItemConversion).mockImplementation(async (_sku, payload) => ({
      item_sku: 'DUNE', lines: [], ...payload, inventory_sync: { ok: true, problems: [], skipped: [] },
    }) as never)
  })

  it('flags a pack stock unit with no size', async () => {
    vi.mocked(api.fetchItemConversion).mockResolvedValue(null)
    renderSection('PCS')
    expect(await screen.findByText(/Not set: what one PCS holds/)).toBeInTheDocument()
  })

  it('saves what one stock unit holds and the item’s own measures', async () => {
    vi.mocked(api.fetchItemConversion).mockResolvedValue(null)
    const user = userEvent.setup()
    renderSection('PCS')
    await user.click(await screen.findByRole('button', { name: /Add conversions/ }))

    await user.type(screen.getByLabelText('Amount in one PCS'), '2')
    await user.selectOptions(screen.getAllByLabelText('Unit')[0], 'Ltr')

    await user.click(screen.getByRole('button', { name: /Add a measure/ }))
    await user.type(screen.getByLabelText('Equals'), '0.05')
    await user.selectOptions(screen.getAllByLabelText('Unit')[1], 'Ltr')
    await user.click(screen.getByRole('button', { name: /Add a measure/ }))
    await user.type(screen.getAllByLabelText('Equals')[1], '50')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.saveItemConversion).toHaveBeenCalled())
    const payload = vi.mocked(api.saveItemConversion).mock.calls[0][1]
    expect(payload).toMatchObject({ order_unit: 'PCS', pack_qty: '2', base_unit: 'u-Ltr' })
    expect(payload.lines).toEqual([
      { label: '1 Tbs', quantity: '0.05', unit: 'u-Ltr', gram_equivalent: null },
      { label: '1 Tbs', quantity: '50', unit: 'u-g', gram_equivalent: null },
    ])
    expect(await screen.findByText('Conversions saved and sent to inventory.')).toBeInTheDocument()
  })

  it('asks nothing extra for a measure stock unit (KG)', async () => {
    vi.mocked(api.fetchItemConversion).mockResolvedValue(null)
    const user = userEvent.setup()
    renderSection('KG')
    await user.click(await screen.findByRole('button', { name: /Add conversions/ }))
    expect(screen.queryByLabelText('Amount in one KG')).toBeNull()
  })
})
