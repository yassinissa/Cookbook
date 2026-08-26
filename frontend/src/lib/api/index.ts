/*
 * The one place screens get data. Each function hits Django; when the app is
 * launched with VITE_USE_SEED=1 it returns the seed catalogue instead, so the
 * leadership demo is hermetic and every screen looks full.
 */
import { http, listData, USE_SEED } from '@/lib/http'
import * as seed from '@/lib/seed'
import {
  filterDashboard,
  filterDishDetail,
  filterDishList,
  filterMenuDetail,
  filterMenuList,
} from '@/lib/seed/filterForIdentity'
import type {
  Dashboard,
  DishRecipeDetail,
  DishRecipeListItem,
  InventoryItem,
  InventoryItemDetail,
  MenuDetail,
  MenuLine,
  MenuListItem,
  MenuSnapshot,
  MenuTrends,
  Paginated,
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
