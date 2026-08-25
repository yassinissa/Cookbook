export const inputClass = 'w-full px-2 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-stone-400'

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

export function IngredientRows({ ingredients, units, items, onChange, onAdd, onRemove }) {
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-700">Ingredients</h2>
        <button type="button" onClick={onAdd} className="text-sm text-stone-600 hover:text-stone-900">+ Add ingredient</button>
      </div>
      <div className="space-y-2">
        {ingredients.map((ing, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input list="item-skus" className={`${inputClass} col-span-3`} placeholder="SKU" value={ing.item_sku}
              onChange={(e) => onChange(i, 'item_sku', e.target.value)} />
            <input className={`${inputClass} col-span-3`} placeholder="Display name" value={ing.item_name_snapshot}
              onChange={(e) => onChange(i, 'item_name_snapshot', e.target.value)} />
            <input className={`${inputClass} col-span-2`} placeholder="Prep note" value={ing.prep_note}
              onChange={(e) => onChange(i, 'prep_note', e.target.value)} />
            <input type="number" step="0.001" className={`${inputClass} col-span-2`} placeholder="Qty" value={ing.quantity}
              onChange={(e) => onChange(i, 'quantity', e.target.value)} />
            <select className={`${inputClass} col-span-1`} value={ing.unit} onChange={(e) => onChange(i, 'unit', e.target.value)}>
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </select>
            <button type="button" onClick={() => onRemove(i)} className="col-span-1 text-red-500 text-sm">✕</button>
          </div>
        ))}
      </div>
      <datalist id="item-skus">
        {items.map((it) => <option key={it.id} value={it.sku}>{it.name_en}</option>)}
      </datalist>
    </section>
  )
}

export function StepRows({ steps, onChange, onAdd, onRemove }) {
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-700">Steps</h2>
        <button type="button" onClick={onAdd} className="text-sm text-stone-600 hover:text-stone-900">+ Add step</button>
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-sm text-stone-400 pt-1.5 w-6">{s.step_number})</span>
            <textarea className={`${inputClass} flex-1`} rows={1} value={s.instruction}
              onChange={(e) => onChange(i, e.target.value)} />
            <button type="button" onClick={() => onRemove(i)} className="text-red-500 text-sm pt-1.5">✕</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString()
}

export function HistoryPanel({ costHistory, priceLabel, activityLog }) {
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-2 gap-4">
      <div>
        <h2 className="text-sm font-semibold text-stone-700 mb-2">Cost history</h2>
        <div className="max-h-48 overflow-y-auto text-sm">
          {costHistory.length === 0 && <p className="text-stone-400">No history yet.</p>}
          {costHistory.map((h) => (
            <div key={h.id} className="flex justify-between py-1 border-b border-stone-100">
              <span className="text-stone-500">{fmtDate(h.created_at)}</span>
              <span className="text-stone-900">
                cost {h.cost}{priceLabel && h.selling_price != null ? ` · ${priceLabel} ${h.selling_price}` : ''}
                {h.output_qty != null ? ` · qty ${h.output_qty}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-stone-700 mb-2">Activity log</h2>
        <div className="max-h-48 overflow-y-auto text-sm">
          {activityLog.length === 0 && <p className="text-stone-400">No activity yet.</p>}
          {activityLog.map((a) => (
            <div key={a.id} className="flex justify-between py-1 border-b border-stone-100">
              <span className="text-stone-500">{fmtDate(a.created_at)}</span>
              <span className="text-stone-900">{a.action_type_display} — {a.changed_by || 'unknown'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
