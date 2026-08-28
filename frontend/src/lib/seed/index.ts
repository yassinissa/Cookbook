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
  ActivityFeed,
  ActivityQuery,
  DishStandardDetail,
  DishStandardListItem,
  ProductionRecipeDetail,
  ProductionRecipeListItem,
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
      image_url: d.image,
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

/* ── production recipes (prep kitchen) ─────────────────────────────── */
interface SeedProdIngredient {
  sku: string
  name: string
  name_ar?: string
  prep?: string
  qty: string
  unit: string
  amount: number
}
interface SeedProd {
  slug: string
  name_en: string
  name_ar: string
  code: string
  prepKitchen: string
  section: string
  output_sku: string
  output_qty: string
  output_unit: string
  prepMinutes: number
  wastePct: number
  ingredients: SeedProdIngredient[]
  steps: string[]
  version?: number
}

const PRODUCTION: SeedProd[] = [
  {
    slug: 'toum',
    name_en: 'Toum — Garlic Emulsion',
    name_ar: 'ثوم مستحلب',
    code: 'P-101',
    prepKitchen: 'pk-sauce',
    section: 'sec-cold',
    output_sku: 'PR-TOUM',
    output_qty: '2.400',
    output_unit: 'u-kg',
    prepMinutes: 25,
    wastePct: 3,
    ingredients: [
      { sku: 'B41', name: 'Garlic, peeled', prep: 'Cloves', qty: '500', unit: 'u-g', amount: 1.94 },
      { sku: 'B2050', name: 'Lemon juice', prep: 'Fresh', qty: '180', unit: 'u-ml', amount: 0.63 },
      { sku: 'B77', name: 'Sunflower oil', qty: '1600', unit: 'u-ml', amount: 2.72 },
      { sku: 'B13', name: 'Sea salt', qty: '18', unit: 'u-g', amount: 0.05 },
    ],
    steps: [
      'Blitz garlic with salt to a smooth paste, scraping down twice.',
      'With the motor running, stream oil and lemon juice alternately, thin ribbons only.',
      'Emulsion should hold a peak; pack into sanitised tubs, film to the surface.',
    ],
  },
  {
    slug: 'tahini-sauce',
    name_en: 'Tahini Sauce Base',
    name_ar: 'صلصة الطحينة',
    code: 'P-102',
    prepKitchen: 'pk-sauce',
    section: 'sec-cold',
    output_sku: 'PR-TAHINI',
    output_qty: '3.000',
    output_unit: 'u-kg',
    prepMinutes: 15,
    wastePct: 2,
    ingredients: [
      { sku: 'B90', name: 'Tahini paste', qty: '1400', unit: 'u-g', amount: 3.36 },
      { sku: 'B2050', name: 'Lemon juice', prep: 'Fresh', qty: '360', unit: 'u-ml', amount: 1.26 },
      { sku: 'B41', name: 'Garlic, peeled', prep: 'Grated', qty: '60', unit: 'u-g', amount: 0.23 },
      { sku: 'B13', name: 'Sea salt', qty: '22', unit: 'u-g', amount: 0.06 },
      { sku: 'B99', name: 'Water, chilled', qty: '1100', unit: 'u-ml', amount: 0 },
    ],
    steps: [
      'Whisk tahini with lemon and garlic — it will seize, keep going.',
      'Add cold water in stages until it loosens to a pourable cream.',
      'Season, pass through a fine chinois, store cold.',
    ],
  },
  {
    slug: 'pita-dough',
    name_en: 'Pita Dough',
    name_ar: 'عجينة الخبز',
    code: 'P-201',
    prepKitchen: 'pk-bread',
    section: 'sec-pastry',
    output_sku: 'PR-PITADOUGH',
    output_qty: '48.000',
    output_unit: 'u-pc',
    prepMinutes: 40,
    wastePct: 4,
    ingredients: [
      { sku: 'B01', name: 'Bread flour', qty: '3000', unit: 'u-g', amount: 1.68 },
      { sku: 'B02', name: 'Fresh yeast', qty: '60', unit: 'u-g', amount: 0.21 },
      { sku: 'B77', name: 'Sunflower oil', qty: '90', unit: 'u-ml', amount: 0.15 },
      { sku: 'B13', name: 'Sea salt', qty: '54', unit: 'u-g', amount: 0.14 },
      { sku: 'B99', name: 'Water, warm', qty: '1900', unit: 'u-ml', amount: 0 },
    ],
    steps: [
      'Dissolve yeast in warm water; add flour, salt, oil.',
      'Knead 8 minutes to a smooth, slightly tacky dough; bulk prove 45 minutes.',
      'Scale to 95 g, ball, bench-rest 15 minutes, then sheet and bake at 300°C.',
    ],
    version: 2,
  },
  {
    slug: 'chicken-stock',
    name_en: 'Brown Chicken Stock',
    name_ar: 'مرق الدجاج',
    code: 'P-301',
    prepKitchen: 'pk-hot',
    section: 'sec-hot',
    output_sku: 'PR-CHXSTOCK',
    output_qty: '18.000',
    output_unit: 'u-ltr',
    prepMinutes: 30,
    wastePct: 6,
    ingredients: [
      { sku: 'B120', name: 'Chicken carcass', prep: 'Roasted', qty: '6000', unit: 'u-g', amount: 4.2 },
      { sku: 'B121', name: 'Mirepoix mix', prep: 'Rough cut', qty: '1800', unit: 'u-g', amount: 0.9 },
      { sku: 'B122', name: 'Tomato paste', qty: '200', unit: 'u-g', amount: 0.32 },
      { sku: 'B123', name: 'Bay & peppercorn sachet', qty: '2', unit: 'u-pc', amount: 0.18 },
    ],
    steps: [
      'Roast carcasses and mirepoix to deep colour; deglaze the tray.',
      'Cover with cold water, bring to a bare simmer, skim for the first hour.',
      'Simmer 6 hours, strain, chill rapidly, portion into 3 L bags.',
    ],
  },
  {
    slug: 'pomegranate-reduction',
    name_en: 'Pomegranate Molasses Reduction',
    name_ar: 'دبس الرمان المركّز',
    code: 'P-103',
    prepKitchen: 'pk-sauce',
    section: 'sec-hot',
    output_sku: 'PR-POMRED',
    output_qty: '1.600',
    output_unit: 'u-ltr',
    prepMinutes: 20,
    wastePct: 8,
    ingredients: [
      { sku: 'B60', name: 'Pomegranate juice', qty: '3000', unit: 'u-ml', amount: 5.1 },
      { sku: 'B61', name: 'Caster sugar', qty: '240', unit: 'u-g', amount: 0.19 },
      { sku: 'B2050', name: 'Lemon juice', prep: 'Fresh', qty: '90', unit: 'u-ml', amount: 0.32 },
    ],
    steps: [
      'Combine juice and sugar, bring to a simmer.',
      'Reduce slowly by just over half until it coats a spoon.',
      'Finish with lemon, cool — it thickens further; bottle.',
    ],
  },
  {
    slug: 'shawarma-marinade',
    name_en: 'Chicken Shawarma Marinade',
    name_ar: 'تتبيلة شاورما الدجاج',
    code: 'P-401',
    prepKitchen: 'pk-poultry',
    section: 'sec-grill',
    output_sku: 'PR-SHWMAR',
    output_qty: '4.500',
    output_unit: 'u-kg',
    prepMinutes: 20,
    wastePct: 3,
    ingredients: [
      { sku: 'B70', name: 'Laban / yoghurt', qty: '1600', unit: 'u-g', amount: 1.44 },
      { sku: 'B71', name: 'Shawarma spice blend', qty: '260', unit: 'u-g', amount: 1.95 },
      { sku: 'B72', name: 'Garlic paste', qty: '180', unit: 'u-g', amount: 0.7 },
      { sku: 'B2050', name: 'Lemon juice', prep: 'Fresh', qty: '300', unit: 'u-ml', amount: 1.05 },
      { sku: 'B77', name: 'Sunflower oil', qty: '400', unit: 'u-ml', amount: 0.68 },
      { sku: 'B13', name: 'Sea salt', qty: '70', unit: 'u-g', amount: 0.18 },
    ],
    steps: [
      'Blend all wet ingredients smooth; whisk in the spice blend.',
      'Check seasoning against a poached test piece.',
      'Label with the batch date — use within 48 hours.',
    ],
  },
]

const prodBreakdown = (p: SeedProd) => {
  const items = p.ingredients.reduce((s, i) => s + i.amount, 0)
  const waste = items * (p.wastePct / 100)
  const perBatch = items + waste
  const perUnit = Number(p.output_qty) > 0 ? perBatch / Number(p.output_qty) : null
  return {
    items: r3(items),
    waste: r3(waste),
    labor: '0.000',
    per_serving: r3(perBatch),
    food_cost_pct: null,
    revenue_pct: null,
    cost_per_unit: perUnit === null ? null : r3(perUnit),
    scenarios: [] as never[],
    lines: p.ingredients.map((i) => ({
      sku: i.sku,
      quantity: i.qty,
      unit: unitCode(i.unit),
      amount: i.amount.toFixed(4),
      status: 'ok' as const,
      detail: '',
    })),
    issues: [] as never[],
  }
}

const prodCost = (p: SeedProd) => Number(prodBreakdown(p).per_serving)

export function seedProductionList(): ProductionRecipeListItem[] {
  return PRODUCTION.map((p) => ({
    id: p.slug,
    name_en: p.name_en,
    name_ar: p.name_ar,
    recipe_code: p.code,
    prep_kitchen: PREP_KITCHENS.find((k) => k.id === p.prepKitchen)?.name_en ?? '',
    prep_kitchen_ref: p.prepKitchen,
    prep_kitchen_name: PREP_KITCHENS.find((k) => k.id === p.prepKitchen)?.name_en ?? null,
    section: p.section,
    section_name: secById(p.section).name,
    output_item_sku: p.output_sku,
    output_qty: p.output_qty,
    output_unit: p.output_unit,
    output_unit_code: unitCode(p.output_unit),
    cost: r3(prodCost(p)),
    version: p.version ?? 1,
    is_current: true,
    ingredient_count: p.ingredients.length,
    created_at: '2026-06-15T08:00:00Z',
  }))
}

export function seedProductionDetail(id: string): ProductionRecipeDetail {
  const p = PRODUCTION.find((x) => x.slug === id) ?? PRODUCTION[0]
  const bd = prodBreakdown(p)
  return {
    id: p.slug,
    name_en: p.name_en,
    name_ar: p.name_ar,
    recipe_code: p.code,
    revision: p.version && p.version > 1 ? `Rev.0${p.version}` : 'Rev.01',
    revision_date: '2026-08-04',
    prep_kitchen: PREP_KITCHENS.find((k) => k.id === p.prepKitchen)?.name_en ?? '',
    prep_kitchen_ref: p.prepKitchen,
    section: secById(p.section),
    output_item_sku: p.output_sku,
    output_qty: p.output_qty,
    output_unit: UNITS.find((u) => u.id === p.output_unit) ?? null,
    prep_time_minutes: p.prepMinutes,
    expected_waste_pct: r2(p.wastePct),
    include_labor_cost: false,
    labor_cost: '0.000',
    cost: r3(prodCost(p)),
    cost_breakdown: bd,
    nutrition: {},
    cost_per_unit: bd.cost_per_unit,
    approved_by: APPROVERS[1],
    qa_approved_by: APPROVERS[2],
    approved_at: '2026-08-05',
    notes: 'Yield assumes standard trim. Re-cost when the base oil contract changes.',
    version: p.version ?? 1,
    is_current: true,
    ingredients: p.ingredients.map((i, idx) => ({
      id: `${p.slug}-ing-${idx}`,
      order: idx + 1,
      item_sku: i.sku,
      item_name_snapshot: i.name,
      prep_note: i.prep ?? '',
      quantity: i.qty,
      unit: i.unit,
      unit_detail: UNITS.find((u) => u.id === i.unit) ?? null,
    })),
    steps: p.steps.map((instruction, idx) => ({
      id: `${p.slug}-step-${idx}`,
      step_number: idx + 1,
      instruction,
    })),
    cost_history: [
      { id: `${p.slug}-ch-1`, cost: r3(prodCost(p) * 0.93), output_qty: p.output_qty, created_at: '2026-06-15T08:00:00Z' },
      { id: `${p.slug}-ch-2`, cost: r3(prodCost(p)), output_qty: p.output_qty, created_at: '2026-08-04T10:00:00Z' },
    ],
    activity_log: [
      { id: `${p.slug}-al-1`, action_type: 'created', action_type_display: 'Created', description: '', changed_by: 'karim', created_at: '2026-06-15T08:00:00Z' },
      { id: `${p.slug}-al-2`, action_type: 'recalculated', action_type_display: 'Cost recalculated', description: '', changed_by: 'omar', created_at: '2026-08-04T10:00:00Z' },
    ],
    created_at: '2026-06-15T08:00:00Z',
    updated_at: '2026-08-04T10:00:00Z',
  }
}

export function seedProductionVersions(id: string): { lineage_key: string; versions: VersionRow[] } {
  const p = PRODUCTION.find((x) => x.slug === id) ?? PRODUCTION[0]
  const current = seedProductionDetail(id)
  if ((p.version ?? 1) <= 1) {
    return {
      lineage_key: `lin-${id}`,
      versions: [
        {
          id,
          version: 1,
          is_current: true,
          is_viewed: true,
          revision: 'Rev.01',
          revision_date: '2026-06-15',
          cost: current.cost,
          selling_price: null,
          output_qty: p.output_qty,
          created_at: '2026-06-15T08:00:00Z',
          updated_at: '2026-06-15T08:00:00Z',
          changes_from_previous: null,
        },
      ],
    }
  }
  return {
    lineage_key: `lin-${id}`,
    versions: [
      {
        id: `${id}-v1`,
        version: 1,
        is_current: false,
        is_viewed: false,
        revision: 'Rev.01',
        revision_date: '2026-06-15',
        cost: r3(prodCost(p) * 0.93),
        selling_price: null,
        output_qty: '44.000',
        created_at: '2026-06-15T08:00:00Z',
        updated_at: '2026-06-15T08:00:00Z',
        changes_from_previous: null,
      },
      {
        id,
        version: 2,
        is_current: true,
        is_viewed: true,
        revision: 'Rev.02',
        revision_date: '2026-08-04',
        cost: current.cost,
        selling_price: null,
        output_qty: p.output_qty,
        created_at: '2026-08-04T10:00:00Z',
        updated_at: '2026-08-04T10:00:00Z',
        changes_from_previous: {
          fields_changed: ['output_qty', 'expected_waste_pct'],
          ingredients_added: 1,
          ingredients_removed: 0,
          ingredients_changed: 1,
          steps_added: 0,
          steps_removed: 0,
        },
      },
    ],
  }
}

export function seedProductionDiff(): VersionDiff {
  return {
    from: { id: 'pita-dough-v1', version: 1 },
    to: { id: 'pita-dough', version: 2 },
    fields: [
      { field: 'output_qty', from: '44.000', to: '48.000' },
      { field: 'expected_waste_pct', from: '6.00', to: '4.00' },
    ],
    ingredients: {
      added: [{ item_sku: 'B77', item_name_snapshot: 'Sunflower oil', prep_note: '', quantity: '90', unit: 'ml' }],
      removed: [],
      changed: [
        {
          label: 'B02 (Fresh yeast)',
          from: { item_sku: 'B02', item_name_snapshot: 'Fresh yeast', prep_note: '', quantity: '75', unit: 'g' },
          to: { item_sku: 'B02', item_name_snapshot: 'Fresh yeast', prep_note: '', quantity: '60', unit: 'g' },
        },
      ],
    },
    steps: { added: [], removed: [], count_from: 3, count_to: 3 },
  }
}

/* ── QA/QC standards ──────────────────────────────────────────────── */
const COVERAGE_GROUPS: Record<string, string[]> = {
  portioning: ['portion_weight_g', 'serving_temp_c', 'holding_time_minutes'],
  sensory: ['appearance', 'color', 'aroma', 'texture', 'presentation'],
  flavour: ['primary_flavor', 'secondary_flavor', 'aftertaste', 'mouthfeel'],
  taste_bands: TASTE_AXES.map((a) => `${a}_target`),
  defects: ['critical_defects_not_allowed', 'freshness_standard'],
}

const codeNum = (code: string) => Number(code.replace(/\D/g, '') || '0')
/** deterministic split: every 3rd dish has no standard yet */
const hasStd = (d: SeedDish) => codeNum(d.code) % 3 !== 0
/** of the rest, even codes are signed off, odd ones await review */
const stdApproved = (d: SeedDish) => hasStd(d) && codeNum(d.code) % 2 === 0

function specCoverage(std: Record<string, unknown> | null) {
  if (!std) return { filled: 0, total: 5 }
  const filled = Object.values(COVERAGE_GROUPS).filter((fields) =>
    fields.some((f) => std[f] !== null && std[f] !== undefined && std[f] !== ''),
  ).length
  return { filled, total: 5 }
}

function tasteAxisCount(std: Record<string, unknown> | null) {
  if (!std) return 0
  return TASTE_AXES.filter((a) => std[`${a}_target`] != null && std[`${a}_target`] !== '').length
}

export function seedStandardList(): DishStandardListItem[] {
  return DISHES.map((d) => {
    const has = hasStd(d)
    const std = has ? (standard(d) as Record<string, unknown>) : null
    const approved = stdApproved(d)
    return {
      id: d.slug,
      name_en: d.name_en,
      name_ar: d.name_ar,
      recipe_code: d.code,
      branch: branchById(d.branchSlugs[0]).name_en,
      branch_ref: d.branchSlugs[0],
      category: d.category,
      category_name: catById(d.category).name,
      rating_status: d.ratingStatus,
      has_standard: has,
      is_approved: approved,
      qa_approved_by_name: approved ? APPROVERS[2].name : null,
      approval_date: approved ? '2026-08-06' : null,
      portion_weight_g: (std?.portion_weight_g as string) ?? null,
      serving_temp_c: (std?.serving_temp_c as string) ?? null,
      holding_time_minutes: (std?.holding_time_minutes as number) ?? null,
      taste_axis_count: tasteAxisCount(std),
      spec_coverage: specCoverage(std),
      needs_review: has && !approved,
    }
  })
}

export function seedStandardDetail(id: string): DishStandardDetail {
  const d = DISHES.find((x) => x.slug === id) ?? DISHES[0]
  const has = hasStd(d)
  const approved = stdApproved(d)
  const std = has
    ? {
        ...standard(d),
        qa_approved_by: approved ? APPROVERS[2].id : null,
        approval_date: approved ? '2026-08-06' : null,
      }
    : null
  return {
    id: d.slug,
    name_en: d.name_en,
    name_ar: d.name_ar,
    recipe_code: d.code,
    revision: 'Rev.01',
    branch: branchById(d.branchSlugs[0]).name_en,
    branch_ref: d.branchSlugs[0],
    category: catById(d.category).name,
    section: secById(d.section).name,
    image_url: d.image,
    rating: String(d.rating),
    rating_status: d.ratingStatus,
    taste_profile: d.taste,
    version: 1,
    standard: std as DishStandardDetail['standard'],
    spec_coverage: specCoverage(std as Record<string, unknown> | null),
    needs_review: has && !approved,
    qa_approved_by: approved ? APPROVERS[2] : null,
    updated_at: '2026-08-07T09:00:00Z',
  }
}

/* ── activity & history ───────────────────────────────────────────── */
const ACTIVITY_ACTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'recalculated', label: 'Cost recalculated' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'standard_updated', label: 'QA standard updated' },
  { value: 'standard_approved', label: 'QA standard approved' },
]
const ACTORS = ['nadia', 'omar', 'karim', 'lina', 'yassin']
const ACTIVITY_BASE = Date.parse('2026-08-28T09:00:00Z')

interface SeedActivity {
  id: string
  kind: 'dish' | 'production'
  action: string
  description: string
  recipe_id: string
  recipe_name: string
  recipe_name_ar: string
  recipe_code: string
  recipe_path: string
  scope_name: string | null
  changed_by: string
  ts: number
}

const HOUR = 3600_000

function buildActivity(): SeedActivity[] {
  const out: SeedActivity[] = []
  // each recipe gets a "birth" further back in time; its events lay forward
  // from there (created oldest), so the merged feed reads naturally.
  const recipes = [
    ...DISHES.map((d, i) => ({
      kind: 'dish' as const, i, slug: d.slug, name: d.name_en, name_ar: d.name_ar,
      code: d.code, path: `/recipes/dishes/${d.slug}`,
      scope: branchById(d.branchSlugs[0]).name_en,
    })),
    ...PRODUCTION.map((p, i) => ({
      kind: 'production' as const, i: DISHES.length + i, slug: p.slug, name: p.name_en,
      name_ar: p.name_ar, code: p.code, path: `/recipes/production/${p.slug}`,
      scope: PREP_KITCHENS.find((k) => k.id === p.prepKitchen)?.name_en ?? null,
    })),
  ]

  for (const r of recipes) {
    const birth = ACTIVITY_BASE - (r.i + 2) * 17 * HOUR
    const base = {
      kind: r.kind, recipe_id: r.slug, recipe_name: r.name, recipe_name_ar: r.name_ar,
      recipe_code: r.code, recipe_path: r.path, scope_name: r.scope,
    }
    const events: Array<[string, string, string, number]> = [
      ['c', 'created', '', 0],
    ]
    if (r.i % 2 === 0)
      events.push(['u', 'updated', r.i % 4 === 0 ? 'Revised to v2' : 'Price change', 6])
    if (r.kind === 'production' || r.i % 3 === 0)
      events.push(['r', 'recalculated', '', 10])
    if (r.kind === 'dish' && r.i % 3 === 1)
      events.push(['sa', 'standard_approved', 'Approved by Lina Aoun (QA)', 13])
    if (r.kind === 'dish' && r.i % 5 === 2)
      events.push(['su', 'standard_updated', 'QA standard revised', 4])

    for (const [suffix, action, description, hourOffset] of events) {
      out.push({
        ...base,
        id: `act-${r.slug}-${suffix}`,
        action,
        description,
        changed_by:
          action.startsWith('standard') ? (action === 'standard_updated' ? 'omar' : 'lina')
          : r.kind === 'production' ? ACTORS[r.i % 4]
          : ACTORS[r.i % 5],
        ts: Math.min(ACTIVITY_BASE - HOUR, birth + hourOffset * HOUR),
      })
    }
  }

  return out.sort((a, b) => b.ts - a.ts)
}

const ALL_ACTIVITY = buildActivity()

export function seedActivityFeed(params: ActivityQuery): ActivityFeed {
  const pageSize = 30
  const page = Math.max(1, params.page ?? 1)
  const actions = (params.action ?? '').split(',').filter(Boolean)
  const from = params.date_from ? Date.parse(`${params.date_from}T00:00:00Z`) : null
  const to = params.date_to ? Date.parse(`${params.date_to}T23:59:59Z`) : null
  const q = (params.q ?? '').trim().toLowerCase()

  let rows = ALL_ACTIVITY
  if (params.kind) rows = rows.filter((r) => r.kind === params.kind)
  if (actions.length) rows = rows.filter((r) => actions.includes(r.action))
  if (params.actor) rows = rows.filter((r) => r.changed_by === params.actor)
  if (params.recipe) rows = rows.filter((r) => r.recipe_id === params.recipe)
  if (q) rows = rows.filter((r) => r.recipe_name.toLowerCase().includes(q))
  if (from !== null) rows = rows.filter((r) => r.ts >= from)
  if (to !== null) rows = rows.filter((r) => r.ts <= to)

  const count = rows.length
  const start = (page - 1) * pageSize
  const slice = rows.slice(start, start + pageSize)

  return {
    count,
    page,
    page_size: pageSize,
    num_pages: Math.max(1, Math.ceil(count / pageSize)),
    results: slice.map((r) => {
      const { ts, changed_by, action, ...rest } = r
      return {
        ...rest,
        action,
        action_display: ACTIVITY_ACTIONS.find((a) => a.value === action)?.label ?? action,
        changed_by,
        created_at: new Date(ts).toISOString(),
      }
    }),
    actors: Array.from(new Set(ALL_ACTIVITY.map((r) => r.changed_by))).sort(),
    action_types: ACTIVITY_ACTIONS,
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
