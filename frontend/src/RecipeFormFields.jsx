import ItemPicker from './ItemPicker'

export const inputClass = 'w-full px-2 py-1.5 border border-stone-300 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500'

export const primaryButtonClass = 'bg-accent-600 text-white text-sm px-4 py-2 rounded-md transition-colors hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2'

export const secondaryButtonClass = 'text-sm text-stone-500 hover:text-stone-800 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2'

export const dangerLinkClass = 'text-sm text-danger-600 hover:text-danger-700 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-2'

export function Field({ label, required, help, error, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-500 mb-1">
        {label}
        {required && <span className="text-danger-600"> *</span>}
      </span>
      {children}
      {help && !error && <span className="block text-xs text-stone-400 mt-1">{help}</span>}
      {error && <span className="block text-xs text-danger-600 mt-1">{error}</span>}
    </label>
  )
}

/* KWD money — 3 decimal places (fils), tabular so columns line up. */
export function money(value, { dash = '—' } = {}) {
  if (value === null || value === undefined || value === '') return dash
  const n = Number(value)
  return Number.isNaN(n) ? dash : n.toFixed(3)
}

const RATING_STATUS = {
  ok:        'bg-success-50 text-success-700 border-success-600',
  attention: 'bg-warning-50 text-warning-700 border-warning-600',
  fix:       'bg-danger-50 text-danger-700 border-danger-600',
}

export function RatingPill({ status, rating }) {
  if (!status && (rating === null || rating === undefined || rating === '')) return null
  const cls = RATING_STATUS[status] || 'bg-stone-100 text-stone-600 border-stone-300'
  const label = status ? status[0].toUpperCase() + status.slice(1) : null
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${cls}`}>
      {rating != null && rating !== '' && <span className="tabular-nums font-medium">{rating}</span>}
      {label && <span>{label}</span>}
    </span>
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

function LineCostBadge({ line }) {
  if (!line) return <span className="text-xs text-stone-300">—</span>
  if (line.status === 'ok') {
    return <span className="text-xs tabular-nums text-stone-500">{money(line.amount)}</span>
  }
  const label = { no_price: 'no price', no_conversion: 'no conversion', unknown_sku: 'unknown SKU' }[line.status] || line.status
  return (
    <span className="text-xs text-warning-700 inline-flex items-center gap-1" title={line.detail || label}>
      <span aria-hidden="true">⚠</span>{label}
    </span>
  )
}

export function IngredientRows({ ingredients, units, items, costLines, onChange, onAdd, onRemove }) {
  const showCosts = Array.isArray(costLines) && costLines.length > 0
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-700">Ingredients</h2>
        <button type="button" onClick={onAdd} className={secondaryButtonClass}>+ Add ingredient</button>
      </div>
      {ingredients.length === 0 && (
        <p className="text-sm text-stone-400 mb-2">No ingredients yet — click "Add ingredient" to start.</p>
      )}
      {ingredients.length > 0 && (
        <div className="grid grid-cols-12 gap-2 px-1 mb-1 text-[11px] uppercase tracking-wide text-stone-400">
          <span className="col-span-3">Item</span>
          <span className="col-span-3">Display name</span>
          <span className="col-span-2">Prep note</span>
          <span className="col-span-2 text-right">Qty</span>
          <span className="col-span-1">Unit</span>
          <span className="col-span-1 text-right">{showCosts ? 'Cost' : ''}</span>
        </div>
      )}
      <div className="space-y-2">
        {ingredients.map((ing, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-3">
              <ItemPicker
                value={ing.item_sku}
                items={items}
                onSelect={(sku, item) => {
                  onChange(i, 'item_sku', sku)
                  if (item && !ing.item_name_snapshot) onChange(i, 'item_name_snapshot', item.name_en)
                }}
              />
            </div>
            <input className={`${inputClass} col-span-3`} placeholder="As named in this recipe" value={ing.item_name_snapshot}
              onChange={(e) => onChange(i, 'item_name_snapshot', e.target.value)} />
            <input className={`${inputClass} col-span-2`} placeholder="e.g. Chopped" value={ing.prep_note}
              onChange={(e) => onChange(i, 'prep_note', e.target.value)} />
            <input type="number" step="0.001" className={`${inputClass} col-span-2 tabular-nums text-right`} placeholder="Qty" value={ing.quantity}
              onChange={(e) => onChange(i, 'quantity', e.target.value)} />
            <select className={`${inputClass} col-span-1`} value={ing.unit} onChange={(e) => onChange(i, 'unit', e.target.value)}>
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </select>
            <div className="col-span-1 flex items-center justify-end gap-1">
              {showCosts && <LineCostBadge line={costLines[i]} />}
              <RemoveButton onClick={() => onRemove(i)} label={`Remove ingredient ${i + 1}`} />
            </div>
          </div>
        ))}
      </div>
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
