export const inputClass = 'w-full px-2 py-1.5 border border-stone-300 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500'

export const primaryButtonClass = 'bg-accent-600 text-white text-sm px-4 py-2 rounded-md transition-colors hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2'

export const secondaryButtonClass = 'text-sm text-stone-500 hover:text-stone-800 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2'

export const dangerLinkClass = 'text-sm text-danger-600 hover:text-danger-700 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-2'

export function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-500 mb-1">
        {label}
        {required && <span className="text-danger-600"> *</span>}
      </span>
      {children}
    </label>
  )
}

function RemoveButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="col-span-1 text-stone-400 hover:text-danger-600 transition-colors text-sm rounded focus:outline-none focus:ring-2 focus:ring-danger-500"
    >
      ✕
    </button>
  )
}

export function IngredientRows({ ingredients, units, items, onChange, onAdd, onRemove }) {
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-700">Ingredients</h2>
        <button type="button" onClick={onAdd} className={secondaryButtonClass}>+ Add ingredient</button>
      </div>
      {ingredients.length === 0 && (
        <p className="text-sm text-stone-400 mb-2">No ingredients yet — click "Add ingredient" to start.</p>
      )}
      <div className="space-y-2">
        {ingredients.map((ing, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input list="item-skus" className={`${inputClass} col-span-3`} placeholder="SKU" value={ing.item_sku}
              onChange={(e) => onChange(i, 'item_sku', e.target.value)} />
            <input className={`${inputClass} col-span-3`} placeholder="Display name" value={ing.item_name_snapshot}
              onChange={(e) => onChange(i, 'item_name_snapshot', e.target.value)} />
            <input className={`${inputClass} col-span-2`} placeholder="Prep note" value={ing.prep_note}
              onChange={(e) => onChange(i, 'prep_note', e.target.value)} />
            <input type="number" step="0.001" className={`${inputClass} col-span-2 tabular-nums`} placeholder="Qty" value={ing.quantity}
              onChange={(e) => onChange(i, 'quantity', e.target.value)} />
            <select className={`${inputClass} col-span-1`} value={ing.unit} onChange={(e) => onChange(i, 'unit', e.target.value)}>
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </select>
            <RemoveButton onClick={() => onRemove(i)} label={`Remove ingredient ${i + 1}`} />
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
        <button type="button" onClick={onAdd} className={secondaryButtonClass}>+ Add step</button>
      </div>
      {steps.length === 0 && (
        <p className="text-sm text-stone-400 mb-2">No steps yet — click "Add step" to start.</p>
      )}
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-sm text-stone-400 pt-1.5 w-6 tabular-nums">{s.step_number})</span>
            <textarea className={`${inputClass} flex-1`} rows={1} value={s.instruction}
              onChange={(e) => onChange(i, e.target.value)} />
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove step ${s.step_number}`}
              className="text-stone-400 hover:text-danger-600 transition-colors text-sm pt-1.5 rounded focus:outline-none focus:ring-2 focus:ring-danger-500"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 flex items-center justify-between">
      <p className="text-sm text-danger-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-danger-700 font-medium underline hover:text-danger-800 rounded focus:outline-none focus:ring-2 focus:ring-danger-500"
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message, actionLabel, onAction }) {
  return (
    <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center">
      <p className="text-sm text-stone-500 mb-3">{message}</p>
      {actionLabel && (
        <button type="button" onClick={onAction} className={primaryButtonClass}>{actionLabel}</button>
      )}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-stone-500 py-8 justify-center">
      <svg className="animate-spin h-4 w-4 text-accent-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Loading…
    </div>
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
            <div key={h.id} className="flex justify-between py-1.5 px-1 -mx-1 rounded hover:bg-stone-50 border-b border-stone-100 last:border-0">
              <span className="text-stone-500">{fmtDate(h.created_at)}</span>
              <span className="text-stone-900 tabular-nums">
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
            <div key={a.id} className="flex justify-between py-1.5 px-1 -mx-1 rounded hover:bg-stone-50 border-b border-stone-100 last:border-0">
              <span className="text-stone-500">{fmtDate(a.created_at)}</span>
              <span className="text-stone-900">{a.action_type_display} — {a.changed_by || 'unknown'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
