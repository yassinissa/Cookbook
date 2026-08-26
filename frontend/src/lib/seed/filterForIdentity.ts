/*
 * Seed mode only: make the seed responses respect the current demo identity's
 * capabilities and data scope, so the identity switcher visibly changes what a
 * scoped user sees — matching what the real backend enforces.
 */
import { seedIdentity } from './access'
import type {
  Dashboard,
  DishRecipeDetail,
  DishRecipeListItem,
  MenuDetail,
  MenuListItem,
} from '@/types/api'

const COST_KEYS = [
  'cost', 'labor_cost', 'selling_price', 'food_cost_pct',
  'cost_breakdown', 'cost_per_unit', 'recipe_cost', 'recipe_price',
  'menu_price', 'effective_price',
]

function can(cap: string) {
  const me = seedIdentity().me
  return me.is_superuser || me.capabilities.includes(cap as never)
}

function branchScope(): Set<string> | 'all' {
  const s = seedIdentity().me.scope.branches
  return s === 'all' ? 'all' : new Set(s.map((b) => b.name_en))
}

function stripCost<T>(obj: T): T {
  if (can('costing.view')) return obj
  const out = { ...(obj as Record<string, unknown>) }
  for (const k of COST_KEYS) {
    if (k in out) out[k] = typeof out[k] === 'object' && out[k] !== null ? {} : null
  }
  return out as T
}

export function filterDishList(rows: DishRecipeListItem[]): DishRecipeListItem[] {
  const scope = branchScope()
  const scoped = scope === 'all' ? rows : rows.filter((r) => scope.has(r.branch))
  return scoped.map(stripCost)
}

export function filterDishDetail(dish: DishRecipeDetail): DishRecipeDetail {
  return stripCost(dish)
}

export function filterMenuList(rows: MenuListItem[]): MenuListItem[] {
  const scope = branchScope()
  return scope === 'all' ? rows : rows.filter((m) => scope.has(m.branch_detail.name_en))
}

export function filterMenuDetail(menu: MenuDetail): MenuDetail {
  if (can('costing.view')) return menu
  return { ...menu, lines: menu.lines.map(stripCost) }
}

export function filterDashboard(d: Dashboard): Dashboard {
  const scope = branchScope()
  let out = d
  if (scope !== 'all') {
    out = {
      ...out,
      branch_health: out.branch_health.filter((b) => scope.has(b.name_en)),
      over_target: out.over_target.filter((x) => scope.has(x.branch)),
      attention: {
        ...out.attention,
        items: out.attention.items.filter((x) => scope.has(x.branch)),
      },
      cost_trend: out.cost_trend.filter((c) => [...scope].some((s) => c.label.includes(s))),
      totals: { ...out.totals, branches: [...scope].length },
    }
    out.attention.count = out.attention.items.length
  }
  if (!can('costing.view')) {
    out = {
      ...out,
      food_cost: { avg_pct: null, over_target: out.food_cost.over_target, priced: 0 },
      over_target: out.over_target.map((x) => ({ ...x, cost: null as never, selling_price: null, food_cost_pct: null as never })),
      branch_health: out.branch_health.map((b) => ({ ...b, avg_food_cost_pct: null })),
      cost_trend: out.cost_trend.map((c) => ({ ...c, avg_food_cost_pct: null, total_cost: null as never })),
    }
  }
  if (!can('production.view')) out = { ...out, totals: { ...out.totals, production_recipes: 0 } }
  if (!can('standard.view')) out = { ...out, totals: { ...out.totals, standards: 0 } }
  return out
}
