import { useEffect, useMemo, useState } from 'react'
import { menus, menuLines, dishRecipes } from './lib/cookbookApi'
import { parseApiError } from './lib/parseApiError'
import { useToast } from './Toast'
import {
  inputClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass,
  ErrorState, EmptyState, RatingPill, Spinner, money,
} from './RecipeFormFields'
import TrendChart from './TrendChart'

function fcpClass(p) {
  if (p == null) return 'text-stone-300'
  return p <= 30 ? 'text-success-700' : p <= 38 ? 'text-warning-700' : 'text-danger-700'
}

/* ── list of branch menus ────────────────────────────────────────────── */
function MenuList({ onOpen }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    menus.list().then((d) => setList(d.results ?? d)).catch(() => setError('Could not load menus.'))
  }
  useEffect(load, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!list) return <Spinner />
  if (list.length === 0) return <EmptyState message="No menus yet. Run the reference-data seed to create one per branch." />

  return (
    <div className="overflow-x-auto bg-white rounded-lg border border-stone-200">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-stone-100 text-stone-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Branch</th>
            <th className="text-right px-4 py-2">Dishes</th>
            <th className="text-left px-4 py-2">Last snapshot</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {list.map((m) => (
            <tr key={m.id} className="hover:bg-stone-50 transition-colors">
              <td className="px-4 py-2">
                <span className="text-stone-900">{m.branch_detail?.name_en}</span>
                {m.branch_detail?.name_ar && <span className="text-stone-400 text-xs" dir="rtl"> {m.branch_detail.name_ar}</span>}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-stone-500">{m.line_count}</td>
              <td className="px-4 py-2 text-stone-500">{m.last_snapshot_at ? new Date(m.last_snapshot_at).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => onOpen(m.id)} className="text-sm text-stone-600 hover:text-stone-900 rounded focus:outline-none focus:ring-2 focus:ring-accent-500">Open</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── one menu ────────────────────────────────────────────────────────── */
function MenuDetail({ menuId, onBack }) {
  const toast = useToast()
  const [menu, setMenu] = useState(null)
  const [trend, setTrend] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [adding, setAdding] = useState(false)
  const [allDishes, setAllDishes] = useState([])

  function load() {
    setError('')
    menus.get(menuId).then(setMenu).catch(() => setError('Could not load the menu.'))
    menus.trends(menuId).then(setTrend).catch(() => {})
  }
  useEffect(load, [menuId])
  useEffect(() => { dishRecipes.list().then((d) => setAllDishes(d.results ?? d)).catch(() => {}) }, [])

  const groups = useMemo(() => {
    const g = new Map()
    for (const l of menu?.lines || []) {
      const key = l.category || 'Uncategorised'
      if (!g.has(key)) g.set(key, { name: key, name_ar: l.category_ar, order: l.category_order ?? 99, lines: [] })
      g.get(key).lines.push(l)
    }
    return [...g.values()].sort((a, b) => a.order - b.order)
  }, [menu])

  const onMenu = useMemo(() => new Set((menu?.lines || []).map((l) => l.dish)), [menu])

  async function doAction(kind, fn) {
    setBusy(kind)
    try { await fn(); load(); }
    catch (err) { toast.error(parseApiError(err).message || 'Action failed.') }
    finally { setBusy('') }
  }

  async function patchLine(id, payload) {
    try {
      const updated = await menuLines.update(id, payload)
      setMenu((m) => ({ ...m, lines: m.lines.map((l) => (l.id === id ? updated : l)) }))
    } catch (err) { toast.error(parseApiError(err).message || 'Could not update the line.') }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!menu) return <Spinner />

  const points = (trend?.points || []).map((p) => ({
    label: p.label || new Date(p.date).toLocaleDateString(),
    fcp: p.avg_food_cost_pct == null ? null : Number(p.avg_food_cost_pct),
    cost: Number(p.total_cost),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className={`${secondaryButtonClass} mb-1`}>← All menus</button>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
            {menu.name || `${menu.branch_detail?.name_en} Menu`}
          </h1>
          <p className="text-stone-500 text-sm">{menu.line_count} dishes</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => doAction('build', () => menus.build(menuId).then(() => toast.success('Menu rebuilt from branch dishes.')))}
                  disabled={!!busy} className={secondaryButtonClass}>
            {busy === 'build' ? 'Building…' : '↻ Rebuild from dishes'}
          </button>
          <button onClick={() => doAction('snap', () => menus.snapshot(menuId).then(() => toast.success('Snapshot taken.')))}
                  disabled={!!busy} className={primaryButtonClass}>
            {busy === 'snap' ? 'Saving…' : '📷 Take snapshot'}
          </button>
        </div>
      </div>

      {points.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <TrendChart
            title="Average food cost %" target={30} unit="%"
            points={points.filter((p) => p.fcp != null).map((p) => ({ label: p.label, y: p.fcp }))}
            format={(v) => `${v.toFixed(1)}%`}
          />
          <TrendChart
            title="Total menu cost (KWD)" accent="success"
            points={points.map((p) => ({ label: p.label, y: p.cost }))}
            format={(v) => v.toFixed(2)}
          />
        </div>
      )}

      <div>
        <button onClick={() => setAdding((v) => !v)} className={secondaryButtonClass}>
          {adding ? 'Close' : '+ Add a dish'}
        </button>
        {adding && (
          <div className="mt-2 bg-white border border-stone-200 rounded-lg p-3 max-h-56 overflow-y-auto">
            {allDishes.filter((d) => !onMenu.has(d.id)).map((d) => (
              <button key={d.id} type="button"
                      onClick={() => doAction('add', () => menus.addDish(menuId, d.id).then(() => toast.success(`${d.name_en} added.`)))}
                      className="block w-full text-left px-2 py-1 text-sm rounded hover:bg-accent-50">
                {d.name_en} <span className="text-stone-400 text-xs">{d.category_name}</span>
              </button>
            ))}
            {allDishes.filter((d) => !onMenu.has(d.id)).length === 0 && (
              <p className="text-sm text-stone-400 px-2 py-1">Every dish is already on the menu.</p>
            )}
          </div>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.name} className="bg-white rounded-lg border border-stone-200 overflow-hidden">
          <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-stone-700">{g.name}</h2>
            {g.name_ar && <span className="text-stone-400 text-xs" dir="rtl">{g.name_ar}</span>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-stone-400 text-left">
                <th className="font-medium px-4 py-1.5">Dish</th>
                <th className="font-medium px-2 py-1.5 text-right">Menu price</th>
                <th className="font-medium px-2 py-1.5 text-right">Cost</th>
                <th className="font-medium px-2 py-1.5 text-right">Food cost</th>
                <th className="font-medium px-2 py-1.5">Avail.</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {g.lines.map((l) => (
                <tr key={l.id} className={l.is_available ? '' : 'opacity-50'}>
                  <td className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      {l.image_url && <img src={l.image_url} alt="" className="w-7 h-7 rounded object-cover flex-none" />}
                      <span className="text-stone-900">{l.dish_name}</span>
                      {l.dish_name_ar && <span className="text-stone-400 text-xs" dir="rtl">{l.dish_name_ar}</span>}
                      <RatingPill status={l.rating_status} rating={l.rating} />
                    </div>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input
                      type="number" step="0.001"
                      className={`${inputClass} w-24 text-right tabular-nums`}
                      value={l.menu_price ?? ''}
                      placeholder={money(l.recipe_price)}
                      onChange={(e) => setMenu((m) => ({ ...m, lines: m.lines.map((x) => x.id === l.id ? { ...x, menu_price: e.target.value } : x) }))}
                      onBlur={(e) => patchLine(l.id, { menu_price: e.target.value || null })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-stone-500">{money(l.recipe_cost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <span className={fcpClass(l.food_cost_pct == null ? null : Number(l.food_cost_pct))}>
                      {l.food_cost_pct == null ? '—' : `${Number(l.food_cost_pct).toFixed(1)}%`}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={l.is_available}
                           onChange={(e) => patchLine(l.id, { is_available: e.target.checked })} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => doAction('rm', () => menuLines.remove(l.id))} className={dangerLinkClass}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {groups.length === 0 && (
        <EmptyState message="This menu has no dishes yet." actionLabel="↻ Rebuild from branch dishes"
                    onAction={() => doAction('build', () => menus.build(menuId))} />
      )}
    </div>
  )
}

export default function MenusPage() {
  const [openId, setOpenId] = useState(null)
  return openId
    ? <MenuDetail menuId={openId} onBack={() => setOpenId(null)} />
    : <MenuList onOpen={setOpenId} />
}
