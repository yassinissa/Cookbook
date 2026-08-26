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
    <Page>
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
            return (
              <Link
                key={m.id}
                to={`/menus/${m.branch}`}
                className="group flex flex-col justify-between rounded-card border border-hairline bg-surface p-4 transition-colors hover:border-hairline-strong hover:bg-surface-sunken"
              >
                <div className="flex items-start justify-between">
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
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="tnum text-sm text-ink">
                      {m.line_count} <span className="text-ink-subtle">{t('menus.col.dishes')}</span>
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
