import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from '@/lib/api'
import * as accounts from '@/lib/api/accounts'
import { qk } from '@/lib/queryClient'
import type { MenuDetail, MenuLine } from '@/types/api'

export function useReference() {
  return useQuery({ queryKey: qk.reference, queryFn: api.fetchReference, staleTime: 5 * 60_000 })
}
export function useInventoryItems() {
  return useQuery({
    queryKey: qk.inventory,
    queryFn: api.fetchInventoryItems,
    staleTime: 10 * 60_000,
  })
}
export function useInventoryItemsPage(search: string, page: number, pageSize = 25) {
  return useQuery({
    queryKey: [...qk.inventoryPage(search, page), pageSize],
    queryFn: () => api.fetchInventoryItemsPage({ search, page, pageSize }),
    placeholderData: (prev) => prev,
    staleTime: 5 * 60_000,
  })
}
export function useInventoryItem(id: string | undefined) {
  return useQuery({
    queryKey: qk.inventoryItem(id ?? ''),
    queryFn: () => api.fetchInventoryItem(id as string),
    enabled: !!id,
    staleTime: 10 * 60_000,
  })
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: api.fetchDashboard })
}

export function useDishRecipes(enabled = true) {
  return useQuery({ queryKey: qk.dishes, queryFn: api.fetchDishRecipes, enabled })
}
export function useDishRecipe(id: string | undefined) {
  return useQuery({
    queryKey: qk.dish(id ?? ''),
    queryFn: () => api.fetchDishRecipe(id as string),
    enabled: !!id,
  })
}
export function useDishVersions(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.dishVersions(id ?? ''),
    queryFn: () => api.fetchDishVersions(id as string),
    enabled: !!id && enabled,
  })
}
export function useDishDiff(id: string | undefined, a?: string, b?: string, enabled = true) {
  return useQuery({
    queryKey: qk.dishDiff(id ?? '', a, b),
    queryFn: () => api.fetchDishDiff(id as string, a, b),
    enabled: !!id && enabled,
  })
}

export function useProductionRecipes(enabled = true) {
  return useQuery({
    queryKey: qk.production,
    queryFn: api.fetchProductionRecipes,
    enabled,
  })
}
export function useProductionRecipe(id: string | undefined) {
  return useQuery({
    queryKey: qk.productionRecipe(id ?? ''),
    queryFn: () => api.fetchProductionRecipe(id as string),
    enabled: !!id,
  })
}
export function useProductionVersions(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.productionVersions(id ?? ''),
    queryFn: () => api.fetchProductionVersions(id as string),
    enabled: !!id && enabled,
  })
}
export function useProductionDiff(
  id: string | undefined,
  a?: string,
  b?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.productionDiff(id ?? '', a, b),
    queryFn: () => api.fetchProductionDiff(id as string, a, b),
    enabled: !!id && enabled,
  })
}

export function useMenus() {
  return useQuery({ queryKey: qk.menus, queryFn: api.fetchMenus })
}
export function useMenuByBranch(branchId: string | undefined) {
  return useQuery({
    queryKey: qk.menuByBranch(branchId ?? ''),
    queryFn: () => api.fetchMenuByBranch(branchId as string),
    enabled: !!branchId,
  })
}
export function useMenuTrends(menuId: string | undefined) {
  return useQuery({
    queryKey: qk.menuTrends(menuId ?? ''),
    queryFn: () => api.fetchMenuTrends(menuId as string),
    enabled: !!menuId,
  })
}
export function useMenuSnapshots(menuId: string | undefined) {
  return useQuery({
    queryKey: qk.menuSnapshots(menuId ?? ''),
    queryFn: () => api.fetchMenuSnapshots(menuId as string),
    enabled: !!menuId,
  })
}

/* ── administration ────────────────────────────────────────────────── */
export function useCapabilityGroups() {
  return useQuery({
    queryKey: ['accounts', 'capabilities'],
    queryFn: accounts.fetchCapabilityGroups,
    staleTime: 10 * 60_000,
  })
}
export function useRoles() {
  return useQuery({ queryKey: ['accounts', 'roles'], queryFn: accounts.fetchRoles })
}
export function useAccountUsers() {
  return useQuery({ queryKey: ['accounts', 'users'], queryFn: accounts.fetchAccountUsers })
}

/** Optimistic menu-line price / availability edit. */
export function useUpdateMenuLine(branchId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, payload }: { lineId: string; payload: Partial<MenuLine> }) =>
      api.updateMenuLine(lineId, payload),
    onMutate: async ({ lineId, payload }) => {
      const key = qk.menuByBranch(branchId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<MenuDetail>(key)
      if (previous) {
        qc.setQueryData<MenuDetail>(key, {
          ...previous,
          lines: previous.lines.map((l) => {
            if (l.id !== lineId) return l
            const next = { ...l, ...payload }
            const price = next.menu_price ?? next.recipe_price
            const fcp =
              price && Number(price) > 0
                ? ((Number(next.recipe_cost) / Number(price)) * 100).toFixed(2)
                : null
            return { ...next, effective_price: price, food_cost_pct: fcp }
          }),
        })
      }
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.menuByBranch(branchId), ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.menuByBranch(branchId) })
    },
  })
}
