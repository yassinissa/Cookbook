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
  DishRecipeDetail,
  DishRecipeListItem,
  DishStandardDetail,
  DishStandardListItem,
  InventoryItem,
  InventoryItemDetail,
  ItemConversion,
  ItemNutrition,
  MenuDetail,
  MenuLine,
  MenuListItem,
  MenuSnapshot,
  MenuTrends,
  Paginated,
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
