/*
 * The one place screens get data. Each function hits Django; when the app is
 * launched with VITE_USE_SEED=1 it returns the seed catalogue instead, so the
 * leadership demo is hermetic and every screen looks full.
 */
import { http, listData, USE_SEED } from '@/lib/http'
import * as seed from '@/lib/seed'
import {
  filterActivityFeed,
  filterDashboard,
  filterDishDetail,
  filterDishList,
  filterMenuDetail,
  filterMenuList,
  filterStandardList,
} from '@/lib/seed/filterForIdentity'
import type {
  ActivityFeed,
  ActivityQuery,
  Dashboard,
  DigestSubscription,
  DishRecipeDetail,
  DishRecipeListItem,
  DishStandardDetail,
  DishStandardListItem,
  InventoryItem,
  InventoryItemDetail,
  ItemConversion,
  ItemNutrition,
  ItemStorage,
  DishModifierDetail,
  DishModifierRow,
  EffectiveMenu,
  ID,
  MenuDetail,
  MenuEdition,
  MenuLine,
  MenuListItem,
  MenuPeriod,
  MenuPeriodKind,
  MenuPeriodLine,
  MenuPeriodOp,
  MenuSnapshot,
  MenuTrends,
  ModifierGroup,
  ModifierOption,
  ModifierOptionKind,
  ModifierRole,
  ModifierSelection,
  Paginated,
  PublicMenu,
  PlatingGuideDetail,
  PlatingGuideInput,
  PlatingGuideListItem,
  ProductionRecipeDetail,
  ProductionRecipeListItem,
  ReferenceData,
  VersionDiff,
  VersionRow,
} from '@/types/api'

const delay = (ms = 240) => new Promise((r) => setTimeout(r, ms))

/* ── reference ─────────────────────────────────────────────────────── */
export async function fetchReference(): Promise<ReferenceData> {
  if (USE_SEED) {
    await delay()
    return seed.seedReference()
  }
  const paths = [
    'categories',
    'branches',
    'prep-kitchens',
    'sections',
    'approvers',
    'allergens',
    'service-styles',
    'units',
    'taste-descriptors',
  ]
  const [
    categories,
    branches,
    prepKitchens,
    sections,
    approvers,
    allergens,
    serviceStyles,
    units,
    tasteDescriptors,
  ] = await Promise.all(paths.map((p) => http.get(`/cookbook/reference/${p}/`).then((r) => r.data)))
  return {
    categories,
    branches,
    prepKitchens,
    sections,
    approvers,
    allergens,
    serviceStyles,
    units,
    tasteDescriptors,
  }
}

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  if (USE_SEED) {
    await delay()
    return seed.SEED_INVENTORY_SKUS as InventoryItem[]
  }
  const { data } = await http.get('/inventory/items/')
  return listData<InventoryItem>(data)
}

export interface InventoryPage {
  count: number
  results: InventoryItem[]
}

export async function fetchInventoryItemsPage(opts: {
  search?: string
  page?: number
  pageSize?: number
}): Promise<InventoryPage> {
  const { search = '', page = 1, pageSize = 40 } = opts
  if (USE_SEED) {
    await delay(160)
    const all = seed.SEED_INVENTORY_SKUS as InventoryItem[]
    const q = search.trim().toLowerCase()
    const matched = q
      ? all.filter(
          (i) => i.name_en.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q),
        )
      : all
    const from = (page - 1) * pageSize
    return { count: matched.length, results: matched.slice(from, from + pageSize) }
  }
  const { data } = await http.get<Paginated<InventoryItem>>('/inventory/items/search/', {
    params: { search: search || undefined, page, page_size: pageSize },
  })
  return { count: data.count ?? data.results.length, results: data.results }
}

export async function fetchInventoryItem(id: string): Promise<InventoryItemDetail> {
  if (USE_SEED) {
    await delay(180)
    const base = (seed.SEED_INVENTORY_SKUS as InventoryItem[]).find(
      (i) => i.id === id || i.sku === id,
    )
    if (!base) throw new Error('not found')
    return base as InventoryItemDetail
  }
  const { data } = await http.get(`/inventory/items/${id}/`)
  return data
}

/* ── per-SKU supplements (nutrition facts + allergens) ───────────────── */
async function getOrNull<T>(path: string): Promise<T | null> {
  try {
    const { data } = await http.get<T>(path)
    return data
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) return null
    throw err
  }
}

export async function fetchItemNutrition(sku: string): Promise<ItemNutrition | null> {
  if (USE_SEED) {
    await delay(160)
    return null
  }
  return getOrNull<ItemNutrition>(`/cookbook/item-nutrition/${encodeURIComponent(sku)}/`)
}

export async function saveItemNutrition(
  sku: string,
  payload: Partial<ItemNutrition>,
  exists: boolean,
): Promise<ItemNutrition> {
  if (USE_SEED) {
    await delay(300)
    return { item_sku: sku, ...payload } as ItemNutrition
  }
  const { data } = exists
    ? await http.patch(`/cookbook/item-nutrition/${encodeURIComponent(sku)}/`, payload)
    : await http.post('/cookbook/item-nutrition/', { ...payload, item_sku: sku })
  return data
}

export async function fetchItemConversion(sku: string): Promise<ItemConversion | null> {
  if (USE_SEED) {
    await delay(160)
    return null
  }
  return getOrNull<ItemConversion>(`/cookbook/item-conversions/${encodeURIComponent(sku)}/`)
}

export async function saveItemAllergens(
  sku: string,
  allergens: string[],
  exists: boolean,
): Promise<ItemConversion> {
  if (USE_SEED) {
    await delay(300)
    return { item_sku: sku, allergens } as ItemConversion
  }
  const { data } = exists
    ? await http.patch(`/cookbook/item-conversions/${encodeURIComponent(sku)}/`, { allergens })
    : await http.post('/cookbook/item-conversions/', { item_sku: sku, allergens })
  return data
}

export async function saveItemConversion(
  sku: string,
  payload: Partial<ItemConversion>,
  exists: boolean,
): Promise<ItemConversion> {
  if (USE_SEED) {
    await delay(300)
    return { item_sku: sku, ...payload } as ItemConversion
  }
  const { data } = exists
    ? await http.patch(`/cookbook/item-conversions/${encodeURIComponent(sku)}/`, payload)
    : await http.post('/cookbook/item-conversions/', { ...payload, item_sku: sku })
  return data
}

export async function fetchItemStorage(sku: string): Promise<ItemStorage | null> {
  if (USE_SEED) {
    await delay(160)
    return null
  }
  return getOrNull<ItemStorage>(`/cookbook/item-storage/${encodeURIComponent(sku)}/`)
}

export async function saveItemStorage(
  sku: string,
  payload: Partial<ItemStorage>,
  exists: boolean,
): Promise<ItemStorage> {
  if (USE_SEED) {
    await delay(300)
    return { item_sku: sku, ...payload } as ItemStorage
  }
  const { data } = exists
    ? await http.patch(`/cookbook/item-storage/${encodeURIComponent(sku)}/`, payload)
    : await http.post('/cookbook/item-storage/', { ...payload, item_sku: sku })
  return data
}

/* ── dashboard ─────────────────────────────────────────────────────── */
export async function fetchDashboard(): Promise<Dashboard> {
  if (USE_SEED) {
    await delay(360)
    return filterDashboard(seed.seedDashboard())
  }
  const { data } = await http.get('/cookbook/dashboard/')
  return data
}

/* ── dish recipes ──────────────────────────────────────────────────── */
export async function fetchDishRecipes(): Promise<DishRecipeListItem[]> {
  if (USE_SEED) {
    await delay()
    return filterDishList(seed.seedDishList())
  }
  const { data } = await http.get<Paginated<DishRecipeListItem> | DishRecipeListItem[]>(
    '/cookbook/dish-recipes/',
  )
  return listData(data)
}

export async function fetchDishRecipe(id: string): Promise<DishRecipeDetail> {
  if (USE_SEED) {
    await delay()
    return filterDishDetail(seed.seedDishDetail(id))
  }
  const { data } = await http.get(`/cookbook/dish-recipes/${id}/`)
  return data
}

export async function createDishRecipe(payload: unknown): Promise<DishRecipeDetail> {
  if (USE_SEED) {
    await delay()
    return seed.seedDishDetail('tabbouleh')
  }
  const { data } = await http.post('/cookbook/dish-recipes/', payload)
  return data
}

export async function updateDishRecipe(id: string, payload: unknown): Promise<DishRecipeDetail> {
  if (USE_SEED) {
    await delay()
    return seed.seedDishDetail(id)
  }
  const { data } = await http.patch(`/cookbook/dish-recipes/${id}/`, payload)
  return data
}

export async function deleteDishRecipe(id: string): Promise<void> {
  if (USE_SEED) {
    await delay()
    return
  }
  await http.delete(`/cookbook/dish-recipes/${id}/`)
}

export async function recalcDishRecipe(id: string): Promise<DishRecipeDetail> {
  if (USE_SEED) {
    await delay(500)
    return seed.seedDishDetail(id)
  }
  const { data } = await http.post(`/cookbook/dish-recipes/${id}/recalculate/`)
  return data
}

export async function publishDishRecipe(id: string): Promise<DishRecipeDetail> {
  if (USE_SEED) {
    await delay(600)
    return seed.seedPublishDish(id)
  }
  const { data } = await http.post(`/cookbook/dish-recipes/${id}/publish/`)
  return data
}

export async function fetchDishVersions(id: string): Promise<VersionRow[]> {
  if (USE_SEED) {
    await delay()
    return seed.seedVersions(id).versions
  }
  const { data } = await http.get(`/cookbook/dish-recipes/${id}/versions/`)
  return data.versions
}

export async function fetchDishDiff(
  id: string,
  a?: string,
  b?: string,
): Promise<VersionDiff> {
  if (USE_SEED) {
    await delay()
    return seed.seedDiff()
  }
  const params = new URLSearchParams()
  if (a) params.set('a', a)
  if (b) params.set('b', b)
  const { data } = await http.get(`/cookbook/dish-recipes/${id}/diff/?${params.toString()}`)
  return data
}

/* ── production recipes (prep kitchen) ─────────────────────────────── */
export async function fetchProductionRecipes(): Promise<ProductionRecipeListItem[]> {
  if (USE_SEED) {
    await delay()
    return seed.seedProductionList()
  }
  const { data } = await http.get<
    Paginated<ProductionRecipeListItem> | ProductionRecipeListItem[]
  >('/cookbook/production-recipes/')
  return listData(data)
}

export async function fetchProductionRecipe(id: string): Promise<ProductionRecipeDetail> {
  if (USE_SEED) {
    await delay()
    return seed.seedProductionDetail(id)
  }
  const { data } = await http.get(`/cookbook/production-recipes/${id}/`)
  return data
}

export async function createProductionRecipe(payload: unknown): Promise<ProductionRecipeDetail> {
  if (USE_SEED) {
    await delay()
    return seed.seedProductionDetail('toum')
  }
  const { data } = await http.post('/cookbook/production-recipes/', payload)
  return data
}

export async function updateProductionRecipe(
  id: string,
  payload: unknown,
): Promise<ProductionRecipeDetail> {
  if (USE_SEED) {
    await delay()
    return seed.seedProductionDetail(id)
  }
  const { data } = await http.patch(`/cookbook/production-recipes/${id}/`, payload)
  return data
}

export async function deleteProductionRecipe(id: string): Promise<void> {
  if (USE_SEED) {
    await delay()
    return
  }
  await http.delete(`/cookbook/production-recipes/${id}/`)
}

export async function recalcProductionRecipe(id: string): Promise<ProductionRecipeDetail> {
  if (USE_SEED) {
    await delay(500)
    return seed.seedProductionDetail(id)
  }
  const { data } = await http.post(`/cookbook/production-recipes/${id}/recalculate/`)
  return data
}

export async function publishProductionRecipe(id: string): Promise<ProductionRecipeDetail> {
  if (USE_SEED) {
    await delay(600)
    return seed.seedPublishProduction(id)
  }
  const { data } = await http.post(`/cookbook/production-recipes/${id}/publish/`)
  return data
}

export async function fetchProductionVersions(id: string): Promise<VersionRow[]> {
  if (USE_SEED) {
    await delay()
    return seed.seedProductionVersions(id).versions
  }
  const { data } = await http.get(`/cookbook/production-recipes/${id}/versions/`)
  return data.versions
}

export async function fetchProductionDiff(
  id: string,
  a?: string,
  b?: string,
): Promise<VersionDiff> {
  if (USE_SEED) {
    await delay()
    return seed.seedProductionDiff()
  }
  const params = new URLSearchParams()
  if (a) params.set('a', a)
  if (b) params.set('b', b)
  const { data } = await http.get(
    `/cookbook/production-recipes/${id}/diff/?${params.toString()}`,
  )
  return data
}

/* ── activity & history ───────────────────────────────────────────── */
export async function fetchActivity(params: ActivityQuery): Promise<ActivityFeed> {
  if (USE_SEED) {
    await delay(200)
    return filterActivityFeed(seed.seedActivityFeed(params))
  }
  const clean: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) clean[k] = v as string | number
  }
  const { data } = await http.get<ActivityFeed>('/cookbook/activity/', { params: clean })
  return data
}

/* ── QA/QC standards ──────────────────────────────────────────────── */
export async function fetchDishStandards(): Promise<DishStandardListItem[]> {
  if (USE_SEED) {
    await delay()
    return filterStandardList(seed.seedStandardList())
  }
  const { data } = await http.get<
    Paginated<DishStandardListItem> | DishStandardListItem[]
  >('/cookbook/dish-standards/')
  return listData(data)
}

export async function fetchDishStandard(dishId: string): Promise<DishStandardDetail> {
  if (USE_SEED) {
    await delay()
    return seed.seedStandardDetail(dishId)
  }
  const { data } = await http.get(`/cookbook/dish-standards/${dishId}/`)
  return data
}

export async function updateDishStandard(
  dishId: string,
  payload: unknown,
): Promise<DishStandardDetail> {
  if (USE_SEED) {
    await delay()
    return seed.seedStandardDetail(dishId)
  }
  const { data } = await http.patch(`/cookbook/dish-standards/${dishId}/`, payload)
  return data
}

export async function approveDishStandard(
  dishId: string,
  approverId: string | null,
): Promise<DishStandardDetail> {
  if (USE_SEED) {
    await delay(400)
    return seed.seedStandardDetail(dishId)
  }
  const { data } = await http.post(`/cookbook/dish-standards/${dishId}/approve/`, {
    qa_approved_by: approverId,
  })
  return data
}

/* ── plating guides ────────────────────────────────────────────────── */
function seedPlatingDetail(dishId: string): PlatingGuideDetail {
  const d = seed.seedDishDetail(dishId)
  return {
    id: d.id, name_en: d.name_en, name_ar: d.name_ar, recipe_code: d.recipe_code,
    revision: d.revision, branch: d.branch, branch_ref: d.branch_ref,
    category: d.category?.name ?? null, section: d.section?.name ?? null,
    image_url: d.image_url, version: d.version, plating: null, updated_at: d.updated_at,
  }
}

export async function fetchPlatingGuides(): Promise<PlatingGuideListItem[]> {
  if (USE_SEED) {
    await delay()
    return seed.seedDishList().map((d) => ({
      id: d.id, name_en: d.name_en, name_ar: d.name_ar, recipe_code: d.recipe_code,
      branch: d.branch, branch_ref: null, category: d.category, category_name: d.category_name,
      has_plating: false, image_count: 0, pin_count: 0, plate_spec: '', pickup_window_seconds: null,
    }))
  }
  const { data } = await http.get<
    Paginated<PlatingGuideListItem> | PlatingGuideListItem[]
  >('/cookbook/plating-guides/')
  return listData<PlatingGuideListItem>(data)
}

export async function fetchPlatingGuide(dishId: string): Promise<PlatingGuideDetail> {
  if (USE_SEED) {
    await delay()
    return seedPlatingDetail(dishId)
  }
  const { data } = await http.get(`/cookbook/plating-guides/${dishId}/`)
  return data
}

export async function updatePlatingGuide(
  dishId: string,
  payload: PlatingGuideInput,
): Promise<PlatingGuideDetail> {
  if (USE_SEED) {
    await delay(400)
    return seedPlatingDetail(dishId)
  }
  const { data } = await http.patch(`/cookbook/plating-guides/${dishId}/`, payload)
  return data
}

/* ── weekly cost digest ────────────────────────────────────────────── */
export async function fetchDigestSubscription(): Promise<DigestSubscription> {
  if (USE_SEED) {
    await delay(150)
    return { enrolled: true, cadence: 'weekly', last_sent_at: null }
  }
  const { data } = await http.get('/cookbook/digest-subscription/')
  return data
}

export async function updateDigestSubscription(
  cadence: 'weekly' | 'off',
): Promise<DigestSubscription> {
  if (USE_SEED) {
    await delay(250)
    return { enrolled: true, cadence, last_sent_at: null }
  }
  const { data } = await http.patch('/cookbook/digest-subscription/', { cadence })
  return data
}

/* ── menus ─────────────────────────────────────────────────────────── */
export async function fetchMenus(): Promise<MenuListItem[]> {
  if (USE_SEED) {
    await delay()
    return filterMenuList(seed.seedMenuList())
  }
  const { data } = await http.get('/cookbook/menus/')
  return listData<MenuListItem>(data)
}

/** Menus are keyed by menu id server-side; the UI navigates by branch id. */
export async function fetchMenuByBranch(branchId: string): Promise<MenuDetail> {
  if (USE_SEED) {
    await delay()
    return filterMenuDetail(seed.seedMenuDetail(branchId))
  }
  const menus = await fetchMenus()
  const match = menus.find((m) => m.branch === branchId)
  if (!match) throw new Error('No menu for this branch')
  const { data } = await http.get(`/cookbook/menus/${match.id}/`)
  return data
}

export async function fetchMenuSnapshots(menuId: string): Promise<MenuSnapshot[]> {
  if (USE_SEED) {
    await delay()
    return seed.seedMenuSnapshots(menuId.replace('menu-', ''))
  }
  const { data } = await http.get(`/cookbook/menus/${menuId}/snapshots/`)
  return data
}

export async function fetchMenuTrends(menuId: string): Promise<MenuTrends> {
  if (USE_SEED) {
    await delay()
    return seed.seedMenuTrends(menuId.replace('menu-', ''))
  }
  const { data } = await http.get(`/cookbook/menus/${menuId}/trends/`)
  return data
}

export async function buildMenu(menuId: string): Promise<MenuDetail> {
  if (USE_SEED) {
    await delay(600)
    return seed.seedMenuDetail(menuId.replace('menu-', ''))
  }
  const { data } = await http.post(`/cookbook/menus/${menuId}/build/`)
  return data
}

export async function snapshotMenu(menuId: string, label: string): Promise<MenuSnapshot> {
  if (USE_SEED) {
    await delay(500)
    return seed.seedMenuSnapshots(menuId.replace('menu-', ''))[0]
  }
  const { data } = await http.post(`/cookbook/menus/${menuId}/snapshot/`, { label })
  return data
}

export async function updateMenuLine(lineId: string, payload: Partial<MenuLine>): Promise<MenuLine> {
  if (USE_SEED) {
    await delay(200)
    return { ...(payload as MenuLine), id: lineId }
  }
  const { data } = await http.patch(`/cookbook/menu-lines/${lineId}/`, payload)
  return data
}

export async function deleteMenuLine(lineId: string): Promise<void> {
  if (USE_SEED) {
    await delay(200)
    return
  }
  await http.delete(`/cookbook/menu-lines/${lineId}/`)
}

/* ── specials calendar ─────────────────────────────────────────────── */
export async function fetchMenuPeriods(menuId: string): Promise<MenuPeriod[]> {
  if (USE_SEED) {
    await delay(150)
    return []
  }
  const { data } = await http.get('/cookbook/menu-periods/', { params: { menu: menuId } })
  return listData<MenuPeriod>(data)
}

export interface MenuPeriodWrite {
  menu?: ID
  kind: MenuPeriodKind
  name_en: string
  name_ar?: string
  starts_on: string
  ends_on?: string | null
  weekday_mask?: number
  is_live?: boolean
  notes?: string
  lines?: Array<Partial<MenuPeriodLine> & { dish: ID; op: MenuPeriodOp }>
}

export async function createMenuPeriod(menuId: string, body: MenuPeriodWrite): Promise<MenuPeriod> {
  if (USE_SEED) {
    await delay(300)
    return { ...(body as unknown as MenuPeriod), id: `period-${Date.now()}`, menu: menuId, line_count: body.lines?.length ?? 0, lines: [], kind_display: body.kind, created_at: '', updated_at: '' }
  }
  const { data } = await http.post('/cookbook/menu-periods/', { ...body, menu: menuId })
  return data
}

export async function updateMenuPeriod(periodId: string, body: Partial<MenuPeriodWrite>): Promise<MenuPeriod> {
  if (USE_SEED) {
    await delay(300)
    return { ...(body as unknown as MenuPeriod), id: periodId }
  }
  const { data } = await http.patch(`/cookbook/menu-periods/${periodId}/`, body)
  return data
}

export async function deleteMenuPeriod(periodId: string): Promise<void> {
  if (USE_SEED) {
    await delay(200)
    return
  }
  await http.delete(`/cookbook/menu-periods/${periodId}/`)
}

export async function fetchEffectiveMenu(menuId: string, on: string): Promise<EffectiveMenu> {
  if (USE_SEED) {
    await delay(200)
    const detail = seed.seedMenuDetail(menuId.replace('menu-', ''))
    const byCat = new Map<string, EffectiveMenu['categories'][number]>()
    for (const l of detail.lines) {
      const key = l.category ?? 'Menu'
      if (!byCat.has(key))
        byCat.set(key, { name: key, name_ar: l.category_ar, order: l.category_order ?? 99, items: [] })
      byCat.get(key)!.items.push({
        dish_id: l.dish, name_en: l.dish_name, name_ar: l.dish_name_ar, recipe_code: l.recipe_code,
        category: key, category_ar: l.category_ar, category_order: l.category_order ?? 99,
        price: l.effective_price, image_url: l.image_url, description_en: '', description_ar: '',
        pos_name: l.pos_name, is_available: l.is_available, rating: l.rating,
        rating_status: l.rating_status, sort_order: l.sort_order, source: 'base',
      })
    }
    return {
      menu_id: menuId, branch: { id: detail.branch, name_en: detail.branch_detail.name_en, name_ar: detail.branch_detail.name_ar },
      on, weekday: new Date(on).toLocaleDateString('en', { weekday: 'long' }),
      periods: [], categories: [...byCat.values()].sort((a, b) => a.order - b.order),
      line_count: detail.lines.length,
    }
  }
  const { data } = await http.get(`/cookbook/menus/${menuId}/effective/`, { params: { on } })
  return data
}

export async function fetchMenuEditions(menuId: string): Promise<MenuEdition[]> {
  if (USE_SEED) {
    await delay(150)
    return []
  }
  const { data } = await http.get(`/cookbook/menus/${menuId}/editions/`)
  return listData<MenuEdition>(data)
}

export async function publishMenuEdition(menuId: string, effectiveOn: string): Promise<MenuEdition> {
  if (USE_SEED) {
    await delay(400)
    throw new Error('Publishing is disabled in the demo build.')
  }
  const { data } = await http.post(`/cookbook/menus/${menuId}/publish-edition/`, {
    effective_on: effectiveOn,
  })
  return data
}

/** URL of the QR image for a branch's public menu (for an <img src> — it's a
 *  public endpoint, no auth header needed). */
export function menuQrUrl(branchSlug: string): string {
  const base = (http.defaults.baseURL ?? '/api').replace(/\/$/, '')
  return `${base}/cookbook/public-menu/${branchSlug}/qr/`
}

/** The public, unauthenticated menu payload — used only by the /m/:slug page. */
export async function fetchPublicMenu(slug: string): Promise<PublicMenu> {
  const { data } = await http.get(`/cookbook/public-menu/${slug}/`)
  return data
}

/* ── POS modifiers ─────────────────────────────────────────────────── */
export async function fetchModifierGroups(): Promise<ModifierGroup[]> {
  if (USE_SEED) { await delay(150); return [] }
  const { data } = await http.get('/cookbook/modifier-groups/')
  return listData<ModifierGroup>(data)
}

export interface ModifierGroupWrite {
  name_en: string
  name_ar?: string
  selection: ModifierSelection
  min_select: number
  max_select: number | null
  notes?: string
  options: Array<Partial<ModifierOption> & { name_en: string; kind: ModifierOptionKind }>
}

export async function saveModifierGroup(
  id: ID | null,
  body: ModifierGroupWrite,
): Promise<ModifierGroup> {
  if (USE_SEED) { await delay(300); throw new Error('Disabled in the demo build.') }
  const { data } = id
    ? await http.patch(`/cookbook/modifier-groups/${id}/`, body)
    : await http.post('/cookbook/modifier-groups/', body)
  return data
}

export async function deleteModifierGroup(id: ID): Promise<void> {
  if (USE_SEED) { await delay(200); return }
  await http.delete(`/cookbook/modifier-groups/${id}/`)
}

export async function fetchDishModifiers(): Promise<DishModifierRow[]> {
  if (USE_SEED) { await delay(150); return [] }
  const { data } = await http.get('/cookbook/dish-modifiers/')
  return listData<DishModifierRow>(data)
}

export async function fetchDishModifier(dishId: string): Promise<DishModifierDetail> {
  const { data } = await http.get(`/cookbook/dish-modifiers/${dishId}/`)
  return data
}

export async function updateDishModifiers(
  dishId: string,
  groups: Array<{ group: ID; default_role: ModifierRole; sort_order?: number }>,
): Promise<DishModifierDetail> {
  if (USE_SEED) { await delay(300); throw new Error('Disabled in the demo build.') }
  const { data } = await http.patch(`/cookbook/dish-modifiers/${dishId}/`, { groups })
  return data
}
