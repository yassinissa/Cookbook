import { Link } from 'react-router-dom'

import { FoodCostValue } from '@/components/Meter'
import { Icon } from '@/components/Icon'
import { Page, PageHeader, BiName } from '@/components/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useDashboard, useMenus } from '@/lib/queries'
import { shortDate } from '@/lib/format'
import { useI18n } from '@/i18n'

export function MenuListPage() {
  const { t, locale } = useI18n()
  const { data: menus, isLoading, isError, refetch } = useMenus()
  const { data: dashboard } = useDashboard()

  const healthByBranch = new Map(
    (dashboard?.branch_health ?? []).map((b) => [b.branch_id, b]),
  )

  return (
    <Page stagger>
      <PageHeader eyebrow={t('app.group')} title={t('menus.title')} subtitle={t('menus.subtitle')} />

      {isError && <ErrorState onRetry={() => refetch()} body={t('state.retryHint')} />}
      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {menus && menus.length === 0 && (
        <EmptyState icon="menu" title={t('menus.empty')} />
      )}

      {menus && menus.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((m) => {
            const health = healthByBranch.get(m.branch)
            const alert = Number(health?.avg_food_cost_pct) > 30
            return (
              <Link
                key={m.id}
                to={`/menus/${m.branch}`}
                className="card-lit group relative flex flex-col justify-between overflow-hidden rounded-card border border-hairline bg-surface-raised p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-e2-hover"
              >
                <span
                  aria-hidden
                  className={
                    alert
                      ? 'absolute inset-y-0 start-0 w-[3px] bg-spice-1'
                      : 'absolute inset-y-0 start-0 w-[3px] spice-rail opacity-40'
                  }
                />
                <div className="flex items-start justify-between ps-1.5">
                  <BiName
                    en={m.branch_detail.name_en}
                    ar={m.branch_detail.name_ar}
                    className="text-[15px] font-semibold"
                  />
                  <Icon
                    name="chevronRight"
                    size={16}
                    className="mt-1 text-ink-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                  />
                </div>
                <div className="mt-3 flex items-end justify-between ps-1.5">
                  <div>
                    <p className="text-sm text-ink">
                      <span className="tnum font-mono">{m.line_count}</span>{' '}
                      <span className="text-ink-subtle">{t('menus.col.dishes')}</span>
                    </p>
                    {health?.avg_food_cost_pct && (
                      <div className="mt-1">
                        <FoodCostValue value={health.avg_food_cost_pct} />
                      </div>
                    )}
                  </div>
                  <p className="text-2xs text-ink-subtle">
                    {m.last_snapshot_at
                      ? shortDate(m.last_snapshot_at, locale)
                      : t('menus.never')}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Page>
  )
}
