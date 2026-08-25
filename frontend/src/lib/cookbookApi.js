import { api } from './api'

export async function fetchReferenceData() {
  const [categories, sections, approvers, allergens, serviceStyles, units] = await Promise.all([
    api.get('/cookbook/reference/categories/').then((r) => r.data),
    api.get('/cookbook/reference/sections/').then((r) => r.data),
    api.get('/cookbook/reference/approvers/').then((r) => r.data),
    api.get('/cookbook/reference/allergens/').then((r) => r.data),
    api.get('/cookbook/reference/service-styles/').then((r) => r.data),
    api.get('/cookbook/reference/units/').then((r) => r.data),
  ])
  return { categories, sections, approvers, allergens, serviceStyles, units }
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
