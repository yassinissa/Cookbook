import { api } from './api'

export async function fetchReferenceData() {
  const [categories, branches, sections, approvers, allergens, serviceStyles, units, tasteDescriptors] = await Promise.all([
    api.get('/cookbook/reference/categories/').then((r) => r.data),
    api.get('/cookbook/reference/branches/').then((r) => r.data),
    api.get('/cookbook/reference/sections/').then((r) => r.data),
    api.get('/cookbook/reference/approvers/').then((r) => r.data),
    api.get('/cookbook/reference/allergens/').then((r) => r.data),
    api.get('/cookbook/reference/service-styles/').then((r) => r.data),
    api.get('/cookbook/reference/units/').then((r) => r.data),
    api.get('/cookbook/reference/taste-descriptors/').then((r) => r.data),
  ])
  return { categories, branches, sections, approvers, allergens, serviceStyles, units, tasteDescriptors }
}

export async function fetchInventoryItems() {
  const { data } = await api.get('/inventory/items/')
  return data
}

export const dishRecipes = {
  list: () => api.get('/cookbook/dish-recipes/').then((r) => r.data),
  get: (id) => api.get(`/cookbook/dish-recipes/${id}/`).then((r) => r.data),
  create: (payload) => api.post('/cookbook/dish-recipes/', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/cookbook/dish-recipes/${id}/`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/cookbook/dish-recipes/${id}/`),
  recalculate: (id) => api.post(`/cookbook/dish-recipes/${id}/recalculate/`).then((r) => r.data),
}

export const menus = {
  list: () => api.get('/cookbook/menus/').then((r) => r.data),
  get: (id) => api.get(`/cookbook/menus/${id}/`).then((r) => r.data),
  build: (id) => api.post(`/cookbook/menus/${id}/build/`).then((r) => r.data),
  addDish: (id, dish) => api.post(`/cookbook/menus/${id}/lines/`, { dish }).then((r) => r.data),
  snapshot: (id, label) => api.post(`/cookbook/menus/${id}/snapshot/`, { label }).then((r) => r.data),
  trends: (id) => api.get(`/cookbook/menus/${id}/trends/`).then((r) => r.data),
}

export const menuLines = {
  update: (id, payload) => api.patch(`/cookbook/menu-lines/${id}/`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/cookbook/menu-lines/${id}/`),
}

export const productionRecipes = {
  list: () => api.get('/cookbook/production-recipes/').then((r) => r.data),
  get: (id) => api.get(`/cookbook/production-recipes/${id}/`).then((r) => r.data),
  create: (payload) => api.post('/cookbook/production-recipes/', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/cookbook/production-recipes/${id}/`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/cookbook/production-recipes/${id}/`),
  recalculate: (id) => api.post(`/cookbook/production-recipes/${id}/recalculate/`).then((r) => r.data),
}

async function getBySkuOrNull(basePath, sku) {
  try {
    const { data } = await api.get(`${basePath}${encodeURIComponent(sku)}/`)
    return data
  } catch (err) {
    if (err.response?.status === 404) return null
    throw err
  }
}

// Both are keyed by item_sku (unique on the model), not a UUID — the
// first save for a SKU is a create, every save after is an update.
export const itemConversions = {
  get: (sku) => getBySkuOrNull('/cookbook/item-conversions/', sku),
  create: (payload) => api.post('/cookbook/item-conversions/', payload).then((r) => r.data),
  update: (sku, payload) => api.patch(`/cookbook/item-conversions/${encodeURIComponent(sku)}/`, payload).then((r) => r.data),
}

export const itemNutrition = {
  get: (sku) => getBySkuOrNull('/cookbook/item-nutrition/', sku),
  create: (payload) => api.post('/cookbook/item-nutrition/', payload).then((r) => r.data),
  update: (sku, payload) => api.patch(`/cookbook/item-nutrition/${encodeURIComponent(sku)}/`, payload).then((r) => r.data),
}
