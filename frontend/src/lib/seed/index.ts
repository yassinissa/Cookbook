/*
 * Seed response builders — turn the catalogue into the exact shapes the API
 * returns, so screens render identically whether they hit Django or the seed.
 */
import type {
  Dashboard,
  DishRecipeDetail,
  DishRecipeListItem,
  MenuDetail,
  MenuLine,
  MenuListItem,
  MenuSnapshot,
  MenuTrends,
  NutritionRollup,
  ReferenceData,
  VersionDiff,
  VersionRow,
} from '@/types/api'
import {
  ALLERGENS,
  APPROVERS,
  BRANCHES,
  CATEGORIES,
  DISHES,
  SECTIONS,
  SERVICE_STYLES,
  TASTE_DESCRIPTORS,
  UNITS,
  type SeedDish,
} from './catalog'

export { SEED_INVENTORY_SKUS } from './catalog'

const WORKING_MINUTES_PER_MONTH = 208 * 60
/* one dial to keep the catalogue's line costs landing in a realistic
   22–36% food-cost spread against the menu prices. */
const AMOUNT_SCALE = 0.92
const lineAmount = (raw: string) => Number(raw) * AMOUNT_SCALE
const TASTE_AXES = [
  'sweetness',
  'saltiness',
  'sourness',
  'bitterness',
  'umami',
  'spice',
  'richness',
  'smokiness',
] as const

const r3 = (n: number) => n.toFixed(3)
const r2 = (n: number) => n.toFixed(2)

function branchById(id: string) {
  return BRANCHES.find((b) => b.id === id)!
}
function catById(id: string) {
  return CATEGORIES.find((c) => c.id === id)!
}
function secById(id: string) {
  return SECTIONS.find((s) => s.id === id)!
}
function unitCode(id: string) {
  return UNITS.find((u) => u.id === id)?.code ?? ''
}

interface Costed {
  items: number
  waste: number
  labor: number
  perServing: number
  fcp: number | null
}

function cost(dish: SeedDish): Costed {
  const items = dish.ingredients.reduce(
    (sum, i) => sum + (i.status === 'no_conversion' ? 0 : lineAmount(i.amount)),
    0,
  )
  const waste = items * (dish.wastePct / 100)
  const section = secById(dish.section)
  const salary = section.avg_monthly_salary ? Number(section.avg_monthly_salary) : 0
  const labor = (salary * dish.prepMinutes) / WORKING_MINUTES_PER_MONTH
  const perServing = items + waste + labor
  const fcp = dish.price > 0 ? (perServing / dish.price) * 100 : null
  return { items, waste, labor, perServing, fcp }
}

function nutrition(dish: SeedDish): NutritionRollup {
  // deterministic pseudo-values keyed off the code so they stay stable
  const seed = Number(dish.code.replace('.', '')) % 97
  const base = 120 + seed * 6
  const covered = Math.max(2, dish.ingredients.length - (dish.slug === 'molokhia' ? 2 : 1))
  return {
    calories: r2(base + dish.ingredients.length * 22),
    fat_g: r2(6 + (seed % 11)),
    saturated_fat_g: r2(1.5 + (seed % 4)),
    trans_fat_g: '0.00',
    cholesterol_mg: r2(seed % 40),
    sodium_mg: r2(180 + (seed % 9) * 40),
    carbs_g: r2(12 + (seed % 15)),
    fibers_g: r2(2 + (seed % 5)),
    sugars_g: r2(1 + (seed % 6)),
    added_sugars_g: dish.category === 'cat-dessert' ? r2(14 + (seed % 8)) : '0.00',
    protein_g: r2(4 + (seed % 18)),
    _coverage: { covered, total: dish.ingredients.length },
  }
}

function allergenRollup(dish: SeedDish) {
  const dishNames = dish.allergens.map((id) => ALLERGENS.find((a) => a.id === id)?.name ?? id)
  const fromIngredients = dish.ingredients
    .filter((i) => i.allergens?.length)
    .map((i) => ({
      sku: i.sku,
      name: i.name,
      allergens: (i.allergens ?? []).map((id) => ALLERGENS.find((a) => a.id === id)?.name ?? id),
    }))
  const all = Array.from(
    new Set([...dishNames, ...fromIngredients.flatMap((i) => i.allergens)]),
  )
  return { all, from_ingredients: fromIngredients, dish: dishNames }
}

function breakdown(dish: SeedDish) {
  const c = cost(dish)
  const perServing = c.perServing
  return {
    items: r3(c.items),
    waste: r3(c.waste),
    labor: r3(c.labor),
    per_serving: r3(perServing),
    food_cost_pct: c.fcp === null ? null : r2(c.fcp),
    revenue_pct: c.fcp === null ? null : r2(100 - c.fcp),
    cost_per_unit: null,
    scenarios: [2, 3, 4, 5].map((markup) => ({
      markup,
      price: r3(perServing * markup),
      cost_pct: r2(100 / markup),
    })),
    lines: dish.ingredients.map((i) => ({
      sku: i.sku,
      quantity: i.qty,
      unit: unitCode(i.unit),
      amount: i.status === 'no_conversion' ? '0.0000' : lineAmount(i.amount).toFixed(4),
      status: (i.status ?? 'ok') as 'ok' | 'no_conversion',
      detail: i.status === 'no_conversion' ? 'cannot convert Tbs to g for this item' : '',
    })),
    issues: dish.ingredients
      .filter((i) => i.status && i.status !== 'ok')
      .map((i) => ({
        sku: i.sku,
        status: i.status as 'no_conversion',
        detail: 'cannot convert Tbs to g for this item',
      })),
  }
}

function standard(dish: SeedDish) {
  const axes: Record<string, string | null> = {}
  for (const axis of TASTE_AXES) {
    const v = dish.tasteAxes[axis]
    axes[`${axis}_target`] = v ? String(v[0]) : null
    axes[`${axis}_tolerance`] = v ? String(v[1]) : null
  }
  return {
    id: `std-${dish.slug}`,
    service_style: 'Dine-in',
    branch_applicability: 'All Branches',
    portion_weight_g: dish.portion ? String(dish.portion[0]) : null,
    portion_tolerance_g: dish.portion ? String(dish.portion[1]) : null,
    serving_temp_c: dish.temp ? String(dish.temp[0]) : null,
    temp_tolerance_c: dish.temp ? String(dish.temp[1]) : null,
    holding_time_minutes: dish.category === 'cat-grill' ? 20 : 45,
    appearance: 'Even colour, generous height, clean plate rim.',
    color: 'Vivid, no browning at the edges.',
    aroma: 'Fresh herb and citrus lift on approach.',
    texture: 'Distinct components, no pooling liquid.',
    presentation: 'Centred, garnish deliberate not scattered.',
    primary_flavor: dish.taste.split(',')[0]?.trim() ?? '',
    secondary_flavor: dish.taste.split(',')[1]?.trim() ?? '',
    aftertaste: 'Clean, no bitterness held on the palate.',
    mouthfeel: 'Balanced, neither greasy nor dry.',
    freshness_standard: 'Prepared within service; discard after 4 hours on the line.',
    critical_defects_not_allowed: 'Off aroma, warm serving temperature, broken emulsion.',
    ...axes,
  }
}

const PREP_KITCHENS = [
  { id: 'pk-bread', name_en: 'Bread', name_ar: 'المخبز', code: 'BRD', sort_order: 0, inventory_store_id: '' },
  { id: 'pk-sauce', name_en: 'Sauce', name_ar: 'الصلصات', code: 'SAU', sort_order: 1, inventory_store_id: '' },
  { id: 'pk-hot', name_en: 'Hot Line', name_ar: 'الطبخ الساخن', code: 'HOT', sort_order: 2, inventory_store_id: '' },
  { id: 'pk-meat', name_en: 'Meat', name_ar: 'اللحوم', code: 'MEA', sort_order: 3, inventory_store_id: '' },
  { id: 'pk-poultry', name_en: 'Poultry', name_ar: 'الدواجن', code: 'POU', sort_order: 4, inventory_store_id: '' },
  { id: 'pk-cold', name_en: 'Cold Prep', name_ar: 'التحضير البارد', code: 'CLD', sort_order: 5, inventory_store_id: '' },
  { id: 'pk-pastry', name_en: 'Pastry', name_ar: 'الحلويات', code: 'PAS', sort_order: 6, inventory_store_id: '' },
]

export function seedReference(): ReferenceData {
  return {
    categories: CATEGORIES,
    branches: BRANCHES,
    prepKitchens: PREP_KITCHENS,
    sections: SECTIONS,
    approvers: APPROVERS,
    allergens: ALLERGENS,
    serviceStyles: SERVICE_STYLES,
    units: UNITS,
    tasteDescriptors: TASTE_DESCRIPTORS,
  }
}

export function seedDishList(): DishRecipeListItem[] {
  return DISHES.map((d) => {
    const c = cost(d)
    return {
      id: d.slug,
      name_en: d.name_en,
      name_ar: d.name_ar,
      recipe_code: d.code,
      branch: branchById(d.branchSlugs[0]).name_en,
      category: d.category,
      category_name: catById(d.category).name,
      section: d.section,
      section_name: secById(d.section).name,
      pos_item_name: d.name_en,
      selling_price: r3(d.price),
      cost: r3(c.perServing),
      rating: String(d.rating),
      rating_status: d.ratingStatus,
      has_standard: true,
      version: d.slug === 'tabbouleh' ? 3 : 1,
      is_current: true,
      ingredient_count: d.ingredients.length,
      created_at: '2026-06-01T09:00:00Z',
    }
  })
}

export function seedDishDetail(id: string): DishRecipeDetail {
  const d = DISHES.find((x) => x.slug === id) ?? DISHES[0]
  const c = cost(d)
  return {
    id: d.slug,
    name_en: d.name_en,
    name_ar: d.name_ar,
    recipe_code: d.code,
    revision: d.slug === 'tabbouleh' ? 'Rev.03' : 'Rev.01',
    revision_date: '2026-08-10',
    branch: branchById(d.branchSlugs[0]).name_en,
    branch_ref: d.branchSlugs[0],
    category: catById(d.category),
    section: secById(d.section),
    service_style: SERVICE_STYLES[0],
    allergens: d.allergens.map((aid) => ALLERGENS.find((a) => a.id === aid)!),
    allergen_rollup: allergenRollup(d),
    pos_item_name: d.name_en,
    selling_price: r3(d.price),
    rating: String(d.rating),
    rating_status: d.ratingStatus,
    rating_date: '2026-08-05',
    taste_profile: d.taste,
    image_url: d.image,
    prep_time_minutes: d.prepMinutes,
    expected_waste_pct: r2(d.wastePct),
    include_labor_cost: true,
    labor_cost: r3(c.labor),
    cost: r3(c.perServing),
    cost_breakdown: breakdown(d),
    nutrition: nutrition(d),
    food_cost_pct: c.fcp === null ? null : r2(c.fcp),
    approved_by: APPROVERS[0],
    qa_approved_by: APPROVERS[2],
    approved_at: '2026-08-11',
    notes: 'Hold dressing separate for delivery. Cross-check portion weight every service.',
    version: d.slug === 'tabbouleh' ? 3 : 1,
    is_current: true,
    ingredients: d.ingredients.map((i, idx) => ({
      id: `${d.slug}-ing-${idx}`,
      order: idx + 1,
      item_sku: i.sku,
      item_name_snapshot: i.name,
      prep_note: i.prep ?? '',
      quantity: i.qty,
      unit: i.unit,
      unit_detail: UNITS.find((u) => u.id === i.unit) ?? null,
    })),
    steps: d.steps.map((instruction, idx) => ({
      id: `${d.slug}-step-${idx}`,
      step_number: idx + 1,
      instruction,
    })),
    standard: standard(d),
    price_history: [
      { id: `${d.slug}-ph-1`, cost: r3(c.perServing * 0.94), selling_price: r3(d.price), created_at: '2026-06-01T09:00:00Z' },
      { id: `${d.slug}-ph-2`, cost: r3(c.perServing), selling_price: r3(d.price), created_at: '2026-08-10T14:30:00Z' },
    ],
    activity_log: [
      { id: `${d.slug}-al-1`, action_type: 'created', action_type_display: 'Created', description: '', changed_by: 'nadia', created_at: '2026-06-01T09:00:00Z' },
      { id: `${d.slug}-al-2`, action_type: 'updated', action_type_display: 'Updated', description: 'Revised to v2', changed_by: 'karim', created_at: '2026-07-18T11:10:00Z' },
      { id: `${d.slug}-al-3`, action_type: 'recalculated', action_type_display: 'Cost recalculated', description: '', changed_by: 'omar', created_at: '2026-08-10T14:30:00Z' },
    ],
    created_at: '2026-06-01T09:00:00Z',
    updated_at: '2026-08-10T14:30:00Z',
  }
}

export function seedVersions(id: string): { lineage_key: string; versions: VersionRow[] } {
  if (id !== 'tabbouleh') {
    return {
      lineage_key: `lin-${id}`,
      versions: [
        {
          id,
          version: 1,
          is_current: true,
          is_viewed: true,
          revision: 'Rev.01',
          revision_date: '2026-06-01',
          cost: seedDishDetail(id).cost,
          selling_price: seedDishDetail(id).selling_price,
          output_qty: null,
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T09:00:00Z',
          changes_from_previous: null,
        },
      ],
    }
  }
  return {
    lineage_key: 'lin-tabbouleh',
    versions: [
      {
        id: 'tabbouleh-v1',
        version: 1,
        is_current: false,
        is_viewed: false,
        revision: 'Rev.01',
        revision_date: '2026-06-01',
        cost: '0.792',
        selling_price: '2.750',
        output_qty: null,
        created_at: '2026-06-01T09:00:00Z',
        updated_at: '2026-06-01T09:00:00Z',
        changes_from_previous: null,
      },
      {
        id: 'tabbouleh-v2',
        version: 2,
        is_current: false,
        is_viewed: false,
        revision: 'Rev.02',
        revision_date: '2026-07-18',
        cost: '0.831',
        selling_price: '2.900',
        output_qty: null,
        created_at: '2026-07-18T11:10:00Z',
        updated_at: '2026-07-18T11:10:00Z',
        changes_from_previous: {
          fields_changed: ['selling_price', 'expected_waste_pct'],
          ingredients_added: 0,
          ingredients_removed: 0,
          ingredients_changed: 1,
          steps_added: 0,
          steps_removed: 0,
        },
      },
      {
        id: 'tabbouleh',
        version: 3,
        is_current: true,
        is_viewed: true,
        revision: 'Rev.03',
        revision_date: '2026-08-10',
        cost: seedDishDetail('tabbouleh').cost,
        selling_price: '2.900',
        output_qty: null,
        created_at: '2026-08-10T14:30:00Z',
        updated_at: '2026-08-10T14:30:00Z',
        changes_from_previous: {
          fields_changed: ['name_en', 'prep_time_minutes'],
          ingredients_added: 1,
          ingredients_removed: 0,
          ingredients_changed: 2,
          steps_added: 1,
          steps_removed: 0,
        },
      },
    ],
  }
}

export function seedDiff(): VersionDiff {
  return {
    from: { id: 'tabbouleh-v2', version: 2 },
    to: { id: 'tabbouleh', version: 3 },
    fields: [
      { field: 'name_en', from: 'Tabbouleh Salad', to: 'Tabbouleh' },
      { field: 'prep_time_minutes', from: '10', to: '12' },
      { field: 'expected_waste_pct', from: '2.00', to: '1.00' },
      { field: 'cost', from: '0.831', to: seedDishDetail('tabbouleh').cost },
    ],
    ingredients: {
      added: [
        { item_sku: 'B13', item_name_snapshot: 'Sea salt', prep_note: '', quantity: '4', unit: 'g' },
      ],
      removed: [],
      changed: [
        {
          label: 'B72 (Finely chopped)',
          from: { item_sku: 'B72', item_name_snapshot: 'Parsley', prep_note: 'Chopped', quantity: '160', unit: 'g' },
          to: { item_sku: 'B72', item_name_snapshot: 'Parsley', prep_note: 'Finely chopped', quantity: '190', unit: 'g' },
        },
        {
          label: 'B2050',
          from: { item_sku: 'B2050', item_name_snapshot: 'Lemon juice', prep_note: '', quantity: '70', unit: 'ml' },
          to: { item_sku: 'B2050', item_name_snapshot: 'Lemon juice', prep_note: 'Fresh', quantity: '80', unit: 'ml' },
        },
      ],
    },
    steps: {
      added: ['Rest 5 minutes, correct the acidity, and plate over cos leaves.'],
      removed: [],
      count_from: 3,
      count_to: 4,
    },
  }
}

/* ── menus ─────────────────────────────────────────────────────────── */
const PRICE_OVERRIDES: Record<string, Record<string, number>> = {
  'br-avenues': { hummus: 2.9, tabbouleh: 3.2 },
  'br-boulevard': { 'shish-taouk': 4.6 },
  'br-salmiya': { knafeh: 3.9 },
}

function menuLines(branchId: string): MenuLine[] {
  return DISHES.filter((d) => d.branchSlugs.includes(branchId))
    .sort((a, b) => catById(a.category).sort_order - catById(b.category).sort_order)
    .map((d, idx) => {
      const c = cost(d)
      const override = PRICE_OVERRIDES[branchId]?.[d.slug]
      const effective = override ?? d.price
      const fcp = effective > 0 ? (c.perServing / effective) * 100 : null
      return {
        id: `${branchId}-${d.slug}`,
        dish: d.slug,
        dish_name: d.name_en,
        dish_name_ar: d.name_ar,
        recipe_code: d.code,
        category: catById(d.category).name,
        category_ar: catById(d.category).menu_title_ar,
        category_order: catById(d.category).sort_order,
        recipe_cost: r3(c.perServing),
        recipe_price: r3(d.price),
        rating: String(d.rating),
        rating_status: d.ratingStatus,
        menu_price: override ? r3(override) : null,
        effective_price: r3(effective),
        food_cost_pct: fcp === null ? null : r2(fcp),
        pos_name: d.name_en,
        image_url: d.image,
        sort_order: idx * 10,
        is_available: d.slug !== 'muhammara' || branchId !== 'br-jabriya',
      }
    })
}

export function seedMenuList(): MenuListItem[] {
  return BRANCHES.map((b, i) => ({
    id: `menu-${b.id}`,
    branch: b.id,
    branch_detail: b,
    name: `${b.name_en} Menu`,
    name_ar: `قائمة ${b.name_ar}`,
    line_count: menuLines(b.id).length,
    last_snapshot_at: i % 3 === 2 ? null : `2026-08-${12 + i}T08:00:00Z`,
    is_active: true,
    created_at: '2026-05-01T09:00:00Z',
  }))
}

export function seedMenuDetail(branchId: string): MenuDetail {
  const b = BRANCHES.find((x) => x.id === branchId) ?? BRANCHES[0]
  const list = seedMenuList().find((m) => m.branch === b.id)!
  return { ...list, notes: '', lines: menuLines(b.id) }
}

export function seedMenuSnapshots(branchId: string): MenuSnapshot[] {
  const lines = menuLines(branchId)
  const dates = ['2026-05-20', '2026-06-17', '2026-07-15', '2026-08-12']
  return dates.map((date, i) => {
    const drift = 1 + (dates.length - 1 - i) * 0.03
    return {
      id: `${branchId}-snap-${i}`,
      label: i === 0 ? 'Baseline' : `Costing review ${i}`,
      taken_by: ['nadia', 'omar', 'karim', 'lina'][i % 4],
      created_at: `${date}T08:00:00Z`,
      lines: lines.map((l) => ({
        id: `${l.id}-s${i}`,
        dish_name: l.dish_name,
        recipe_code: l.recipe_code,
        category: l.category ?? '',
        cost: r3(Number(l.recipe_cost) * drift),
        menu_price: l.effective_price,
        food_cost_pct:
          l.effective_price && Number(l.effective_price) > 0
            ? r2(((Number(l.recipe_cost) * drift) / Number(l.effective_price)) * 100)
            : null,
      })),
    }
  })
}

export function seedMenuTrends(branchId: string): MenuTrends {
  const b = BRANCHES.find((x) => x.id === branchId) ?? BRANCHES[0]
  const snaps = seedMenuSnapshots(branchId)
  return {
    menu: `${b.name_en} Menu`,
    points: snaps.map((s) => {
      const fcps = s.lines.map((l) => Number(l.food_cost_pct)).filter((n) => !Number.isNaN(n))
      const totalCost = s.lines.reduce((sum, l) => sum + Number(l.cost), 0)
      const totalPrice = s.lines.reduce((sum, l) => sum + Number(l.menu_price ?? 0), 0)
      return {
        date: s.created_at,
        label: s.label,
        dishes: s.lines.length,
        total_cost: r3(totalCost),
        total_price: r3(totalPrice),
        avg_food_cost_pct: fcps.length ? r2(fcps.reduce((a, c) => a + c, 0) / fcps.length) : null,
        over_30: fcps.filter((f) => f > 30).length,
      }
    }),
  }
}

/* ── dashboard ─────────────────────────────────────────────────────── */
export function seedDashboard(): Dashboard {
  const costed = DISHES.map((d) => ({ d, c: cost(d) }))
  const fcps = costed.map((x) => x.c.fcp).filter((f): f is number => f !== null)
  const avg = fcps.reduce((a, c) => a + c, 0) / fcps.length
  const over = costed.filter((x) => x.c.fcp !== null && x.c.fcp > 30)

  return {
    target_pct: '30',
    totals: {
      dishes: DISHES.length,
      production_recipes: 6,
      menus: BRANCHES.length,
      standards: DISHES.length,
      branches: BRANCHES.length,
    },
    food_cost: { avg_pct: r2(avg), over_target: over.length, priced: fcps.length },
    attention: {
      count: costed.filter((x) => x.d.ratingStatus === 'attention' || x.d.ratingStatus === 'fix' || (x.c.fcp ?? 0) > 30).length,
      items: costed
        .filter((x) => x.d.ratingStatus === 'attention' || x.d.ratingStatus === 'fix' || (x.c.fcp ?? 0) > 30)
        .slice(0, 8)
        .map((x) => ({
          id: x.d.slug,
          name_en: x.d.name_en,
          name_ar: x.d.name_ar,
          recipe_code: x.d.code,
          branch: branchById(x.d.branchSlugs[0]).name_en,
          reasons: [
            ...(x.d.ratingStatus === 'fix' ? ['rating:fix'] : []),
            ...(x.d.ratingStatus === 'attention' ? ['rating:attention'] : []),
            ...((x.c.fcp ?? 0) > 30 ? ['over_target'] : []),
            ...(x.d.ingredients.some((i) => i.status === 'no_conversion') ? ['uncosted_lines'] : []),
          ],
        })),
    },
    over_target: over
      .sort((a, b) => (b.c.fcp ?? 0) - (a.c.fcp ?? 0))
      .map((x) => ({
        id: x.d.slug,
        name_en: x.d.name_en,
        name_ar: x.d.name_ar,
        branch: branchById(x.d.branchSlugs[0]).name_en,
        food_cost_pct: r2(x.c.fcp ?? 0),
        cost: r3(x.c.perServing),
        selling_price: r3(x.d.price),
      })),
    branch_health: BRANCHES.map((b, i) => {
      const dishes = costed.filter((x) => x.d.branchSlugs.includes(b.id))
      const bFcps = dishes.map((x) => x.c.fcp).filter((f): f is number => f !== null)
      const trends = seedMenuTrends(b.id)
      return {
        branch_id: b.id,
        name_en: b.name_en,
        name_ar: b.name_ar,
        menu_id: `menu-${b.id}`,
        dishes: dishes.length,
        avg_food_cost_pct: bFcps.length ? r2(bFcps.reduce((a, c) => a + c, 0) / bFcps.length) : null,
        over_target: bFcps.filter((f) => f > 30).length,
        last_snapshot_at: i % 3 === 2 ? null : `2026-08-${12 + i}T08:00:00Z`,
        trend: trends.points.map((p) => ({
          label: p.label,
          date: p.date,
          avg_food_cost_pct: p.avg_food_cost_pct,
        })),
      }
    }),
    recent_activity: [
      { id: 'ra-1', kind: 'dish', action: 'updated', action_display: 'Updated', description: 'Revised to v3', recipe_id: 'tabbouleh', recipe_name: 'Tabbouleh', changed_by: 'karim', created_at: '2026-08-10T14:30:00Z' },
      { id: 'ra-2', kind: 'dish', action: 'recalculated', action_display: 'Cost recalculated', description: '', recipe_id: 'molokhia', recipe_name: 'Molokhia with Chicken', changed_by: 'omar', created_at: '2026-08-09T16:05:00Z' },
      { id: 'ra-3', kind: 'dish', action: 'created', action_display: 'Created', description: '', recipe_id: 'muhammara', recipe_name: 'Muhammara', changed_by: 'nadia', created_at: '2026-08-08T10:20:00Z' },
      { id: 'ra-4', kind: 'dish', action: 'updated', action_display: 'Updated', description: 'Price change', recipe_id: 'fattoush', recipe_name: 'Fattoush', changed_by: 'lina', created_at: '2026-08-07T09:45:00Z' },
      { id: 'ra-5', kind: 'production', action: 'recalculated', action_display: 'Cost recalculated', description: '', recipe_id: 'toum', recipe_name: 'Toum (Garlic Emulsion)', changed_by: 'karim', created_at: '2026-08-06T13:15:00Z' },
    ],
    cost_trend: BRANCHES.slice(0, 6).flatMap((b) => {
      const p = seedMenuTrends(b.id).points
      const last = p[p.length - 1]
      return [
        {
          label: `${b.name_en} · ${last.label}`,
          date: last.date,
          avg_food_cost_pct: last.avg_food_cost_pct,
          total_cost: last.total_cost,
        },
      ]
    }),
  }
}
