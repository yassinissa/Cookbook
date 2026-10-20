import { FoodCostValue } from '@/components/Meter'
import { Skeleton } from '@/components/States'
import { cn } from '@/lib/cn'
import { kwd } from '@/lib/format'
import { useBranchFoodCost } from '@/lib/queries'
import { useI18n } from '@/i18n'

/**
 * Per-branch total food cost above the Dish Recipes list — total cost over
 * total selling price of every priced dish on that branch (computed
 * server-side). A tile doubles as the branch filter.
 */
export function BranchFoodCostStrip({
  selected,
  onSelect,
}: {
  /** the list's branch filter value (branch name_en, or 'all') */
  selected: string
  onSelect: (branch: string) => void
}) {
  const { t, locale } = useI18n()
  const { data, isLoading, isError, refetch } = useBranchFoodCost()

  if (isError) {
    return (
      <p className="mb-4 text-sm text-ink-muted">
        {t('dishes.branchCost.error')}{' '}
        <button
          type="button"
          onClick={() => refetch()}
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          {t('action.retry')}
        </button>
      </p>
    )
  }
  if (!isLoading && !data?.branches.length) return null

  return (
    <section aria-labelledby="branch-cost-h" className="mb-4">
      <h2
        id="branch-cost-h"
        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle"
      >
        {t('dishes.branchCost.title')}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-card border border-hairline bg-surface p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-5 w-14" />
              <Skeleton className="mt-2 h-3 w-24" />
            </li>
          ))}
        {data?.branches.map((b) => {
          const active = selected === b.name_en
          const gaps = b.unpriced + b.uncosted
          return (
            <li key={b.branch_id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? 'all' : b.name_en)}
                title={t('dishes.branchCost.hint')}
                className={cn(
                  'h-full w-full rounded-card border bg-surface p-3 text-start transition-colors',
                  'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
                  active ? 'border-accent' : 'border-hairline',
                )}
              >
                <span className="block truncate text-xs font-medium text-ink-muted">
                  {locale === 'ar' && b.name_ar ? b.name_ar : b.name_en}
                </span>
                <span className="mt-1 block font-mono text-lg leading-tight">
                  <FoodCostValue value={b.food_cost_pct} />
                </span>
                <span className="tnum mt-1 block font-mono text-2xs text-ink-subtle">
                  {kwd(b.total_cost)} / {kwd(b.total_price)}
                </span>
                <span className={cn('mt-0.5 block text-2xs', gaps ? 'text-warning-ink' : 'text-ink-subtle')}>
                  {gaps
                    ? t('dishes.branchCost.partial', { n: b.priced, total: b.dishes })
                    : t('dishes.branchCost.count', { n: b.dishes })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
