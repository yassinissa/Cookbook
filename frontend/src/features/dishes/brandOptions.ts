/* Which categories / sections a dish of a given brand may use — mirrors the
 * backend's `brand_options`: a brand with its own list sees only that list;
 * any other brand (or no brand) sees the items not tied to a brand. The
 * dish's current value is always kept, so an older dish still shows what it
 * was saved with. */
export interface BrandScoped {
  id: string
  branch_ids?: string[]
}

export function hasBrandList<T extends BrandScoped>(items: T[], branchId: string): boolean {
  return !!branchId && items.some((i) => i.branch_ids?.includes(branchId))
}

export function brandOptions<T extends BrandScoped>(items: T[], branchId: string, currentId = ''): T[] {
  const own = hasBrandList(items, branchId)
  return items.filter((i) =>
    i.id === currentId || (own ? i.branch_ids?.includes(branchId) : !i.branch_ids?.length),
  )
}
