import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const qk = {
  reference: ['reference'] as const,
  inventory: ['inventory'] as const,
  inventoryPage: (search: string, page: number) => ['inventory', 'page', search, page] as const,
  inventoryItem: (id: string) => ['inventory', id] as const,
  itemNutrition: (sku: string) => ['inventory', 'nutrition', sku] as const,
  itemConversion: (sku: string) => ['inventory', 'conversion', sku] as const,
  itemStorage: (sku: string) => ['inventory', 'storage', sku] as const,
  dashboard: ['dashboard'] as const,
  digestSubscription: ['digest-subscription'] as const,
  dishes: ['dishes'] as const,
  dish: (id: string) => ['dishes', id] as const,
  dishVersions: (id: string) => ['dishes', id, 'versions'] as const,
  dishDiff: (id: string, a?: string, b?: string) => ['dishes', id, 'diff', a ?? '', b ?? ''] as const,
  standards: ['standards'] as const,
  standard: (id: string) => ['standards', id] as const,
  plating: ['plating'] as const,
  platingGuide: (dishId: string) => ['plating', dishId] as const,
  activity: (params: Record<string, unknown>) => ['activity', params] as const,
  production: ['production'] as const,
  productionRecipe: (id: string) => ['production', id] as const,
  productionVersions: (id: string) => ['production', id, 'versions'] as const,
  productionDiff: (id: string, a?: string, b?: string) =>
    ['production', id, 'diff', a ?? '', b ?? ''] as const,
  menus: ['menus'] as const,
  menuByBranch: (branchId: string) => ['menus', 'branch', branchId] as const,
  menuSnapshots: (menuId: string) => ['menus', menuId, 'snapshots'] as const,
  menuTrends: (menuId: string) => ['menus', menuId, 'trends'] as const,
  menuPeriods: (menuId: string) => ['menus', menuId, 'periods'] as const,
  effectiveMenu: (menuId: string, on: string) => ['menus', menuId, 'effective', on] as const,
  menuEditions: (menuId: string) => ['menus', menuId, 'editions'] as const,
  publicMenu: (slug: string) => ['public-menu', slug] as const,
  modifierGroups: ['modifier-groups'] as const,
  dishModifiers: ['dish-modifiers'] as const,
  dishModifier: (dishId: string) => ['dish-modifiers', dishId] as const,
}
