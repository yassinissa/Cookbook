import { useEffect, useState } from 'react'
import { api } from './lib/api'
import { logout } from './lib/auth'
import { secondaryButtonClass, ErrorState, Spinner } from './RecipeFormFields'

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="text-stone-900 text-right tabular-nums">{value}</span>
    </div>
  )
}

function ItemDetail({ item }) {
  return (
    <div className="px-4 py-4 bg-stone-50 border-t border-stone-200">
      <DetailRow label="Name (Arabic)" value={item.name_ar} />
      <DetailRow label="Barcode" value={item.barcode} />
      <DetailRow label="Category" value={item.category_display} />
      <DetailRow label="Unit" value={item.unit_detail ? `${item.unit_detail.code} (${item.unit_detail.name_en})` : null} />
      <DetailRow label="Unit cost (KWD)" value={item.unit_cost} />
      <DetailRow label="Selling price (KWD)" value={item.selling_price} />
      <DetailRow label="Reorder level" value={item.reorder_level} />
      <DetailRow
        label="Shelf life"
        value={item.shelf_life_value ? `${item.shelf_life_value} ${item.shelf_life_unit}` : null}
      />
      <DetailRow label="Expiry tracking" value={item.expiry_tracking ? `Yes (alert ${item.expiry_alert_days}d before)` : 'No'} />
      <DetailRow label="Default location" value={item.default_location_name} />
      <DetailRow
        label="Suppliers"
        value={item.suppliers_info?.length ? item.suppliers_info.map((s) => s.name_en ?? s.name).join(', ') : null}
      />
      <DetailRow label="Notes" value={item.notes} />
      <DetailRow label="Active" value={item.is_active ? 'Yes' : 'No'} />
    </div>
  )
}

export default function ItemsList({ onLoggedOut, onBack }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [detailById, setDetailById] = useState({})
  const [detailLoadingId, setDetailLoadingId] = useState(null)
  const [detailErrorId, setDetailErrorId] = useState(null)

  function load() {
    setError('')
    api.get('/inventory/items/')
      .then(({ data }) => setItems(data))
      .catch(() => setError('Could not load items from inventory-platform.'))
  }

  useEffect(load, [])

  async function loadDetail(item) {
    setDetailLoadingId(item.id)
    setDetailErrorId(null)
    try {
      const { data } = await api.get(`/inventory/items/${item.id}/`)
      setDetailById((prev) => ({ ...prev, [item.id]: data }))
    } catch {
      // Don't fabricate a fake item record on failure — that renders
      // misleading fields (e.g. "Active: No") that aren't real data.
      setDetailErrorId(item.id)
    } finally {
      setDetailLoadingId(null)
    }
  }

  function toggleExpand(item) {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(item.id)
    if (!detailById[item.id]) loadDetail(item)
  }

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
            Inventory items {items && <span className="text-stone-400 font-normal text-base tabular-nums">({items.length})</span>}
          </h1>
          <div className="flex items-center gap-4">
            <button onClick={onBack} className={secondaryButtonClass}>Recipes</button>
            <button onClick={() => { logout(); onLoggedOut() }} className={secondaryButtonClass}>Log out</button>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={load} />}
        {!items && !error && <Spinner />}

        {items && (
          <ul className="divide-y divide-stone-200 bg-white rounded-lg border border-stone-200">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => toggleExpand(item)}
                  aria-expanded={expandedId === item.id}
                  className="w-full px-4 py-3 flex justify-between text-left hover:bg-stone-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500"
                >
                  <span className="text-stone-900">{item.name_en}</span>
                  <span className="text-stone-400 text-sm">{item.sku} · {item.item_type_display}</span>
                </button>
                {expandedId === item.id && detailLoadingId === item.id && (
                  <p className="px-4 py-4 text-sm text-stone-400 border-t border-stone-200">Loading details…</p>
                )}
                {expandedId === item.id && detailErrorId === item.id && (
                  <div className="px-4 py-3 border-t border-stone-200">
                    <ErrorState message="Could not load this item's details." onRetry={() => loadDetail(item)} />
                  </div>
                )}
                {expandedId === item.id && detailById[item.id] && !detailLoadingId && detailErrorId !== item.id && (
                  <ItemDetail item={detailById[item.id]} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
