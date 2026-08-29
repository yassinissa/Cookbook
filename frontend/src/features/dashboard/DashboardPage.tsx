import { Link } from 'react-router-dom'

import { Card, CardBody, CardHeader } from '@/components/Card'
import { Sparkline, TrendChart } from '@/components/Charts'
import { FoodCostValue, Meter } from '@/components/Meter'
import { Icon, type IconName } from '@/components/Icon'
import { Page, PageHeader, BiName } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { Stat } from '@/components/Stat'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useDashboard } from '@/lib/queries'
import { relativeTime, shortDate } from '@/lib/format'
import { useI18n, type Locale } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { Dashboard } from '@/types/api'

export function DashboardPage() {
  const { t, locale } = useI18n()
  const { data, isLoading, isError, refetch } = useDashboard()

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.group')}
        title={t('dash.title')}
        subtitle={data ? t('dash.subtitle', { branches: data.totals.branches }) : undefined}
      />

      {isError && <ErrorState body={t('state.retryHint')} onRetry={() => refetch()} />}
      {isLoading && <DashboardSkeleton />}

      {data && (
        <div className="stagger space-y-5">
          <KpiRow data={data} t={t} />
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <AttentionCard data={data} t={t} />
            <OverTargetCard data={data} t={t} />
          </div>
          <BranchHealthCard data={data} t={t} locale={locale} />
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <TrendCard data={data} t={t} />
            <ActivityCard data={data} t={t} locale={locale} />
          </div>
        </div>
      )}
    </Page>
  )
}

type T = (k: MessageKey, v?: Record<string, string | number>) => string

function KpiRow({ data, t }: { data: Dashboard; t: T }) {
  const trend = data.cost_trend
    .map((p) => Number(p.avg_food_cost_pct))
    .filter((n) => !Number.isNaN(n))
  const avg = Number(data.food_cost.avg_pct)
  const over = data.food_cost.over_target
  return (
    <div className="space-y-3">
      <Stat
        featured
        label={t('dash.kpi.avgFoodCost')}
        value={Number.isFinite(avg) ? avg : 0}
        decimals={1}
        suffix="%"
        tone={avg > 30 ? 'warn' : 'good'}
        note={t('cost.target')}
        spark={trend}
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('dash.kpi.dishes')} value={data.totals.dishes} />
        <Stat
          label={t('dash.kpi.overTarget')}
          value={over}
          tone={over > 0 ? 'warn' : 'good'}
          note={over > 0 ? t('dash.kpi.overTargetNote') : t('dash.kpi.allUnder')}
        />
        <Stat label={t('dash.kpi.menus')} value={data.totals.menus} />
      </div>
    </div>
  )
}

function AttentionCard({ data, t }: { data: Dashboard; t: T }) {
  return (
    <Card elevated rail={data.attention.count > 0 ? 'alert' : 'idle'}>
      <CardHeader
        title={t('dash.attention.title')}
        action={
          data.attention.count > 0 ? (
            <Pill tone="warning" icon="warning">
              {data.attention.count}
            </Pill>
          ) : undefined
        }
      />
      <CardBody flush>
        {data.attention.items.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="check" title={t('dash.attention.empty')} />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.attention.items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/recipes/dishes/${item.id}/edit`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <BiName en={item.name_en} ar={item.name_ar} />
                    <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      {item.reasons.map((r) => (
                        <span key={r} className="text-2xs font-medium text-ink-subtle">
                          {t(`reason.${r}` as MessageKey)}
                        </span>
                      ))}
                    </p>
                  </div>
                  <span className="tnum flex-none font-mono text-xs text-ink-subtle">
                    #{item.recipe_code}
                  </span>
                  <Icon
                    name="chevronRight"
                    size={15}
                    className="flex-none text-ink-subtle rtl:rotate-180"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function OverTargetCard({ data, t }: { data: Dashboard; t: T }) {
  return (
    <Card elevated rail={data.over_target.length > 0 ? 'alert' : 'idle'}>
      <CardHeader title={t('dash.overTarget.title')} />
      <CardBody flush>
        {data.over_target.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="check" title={t('dash.overTarget.empty')} />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.over_target.slice(0, 6).map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/recipes/dishes/${d.id}`}
                    className="text-[13px] font-medium text-ink hover:text-accent-ink"
                  >
                    {d.name_en}
                  </Link>
                  <p className="text-xs text-ink-subtle">{d.branch}</p>
                </div>
                <div className="w-28 flex-none">
                  <Meter value={Number(d.food_cost_pct)} size="sm" showTarget />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function BranchHealthCard({ data, t, locale }: { data: Dashboard; t: T; locale: Locale }) {
  return (
    <Card elevated>
      <CardHeader title={t('dash.branchHealth.title')} />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.branch_health.map((b) => {
            const spark = b.trend
              .map((p) => Number(p.avg_food_cost_pct))
              .filter((n) => !Number.isNaN(n))
            const alert = Number(b.avg_food_cost_pct) > 30
            return (
              <Link
                key={b.branch_id}
                to={`/menus/${b.branch_id}`}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface p-3 transition-colors hover:border-hairline-strong hover:bg-surface-sunken"
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
                  <BiName en={b.name_en} ar={b.name_ar} className="text-[13px] font-medium" />
                  <Icon
                    name="chevronRight"
                    size={14}
                    className="mt-0.5 text-ink-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                  />
                </div>
                <div className="mt-2 flex items-end justify-between ps-1.5">
                  <div>
                    <FoodCostValue value={b.avg_food_cost_pct} />
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {t('dash.branch.dishes', { n: b.dishes })}
                      {b.over_target > 0 && ` · ${t('dash.branch.over', { n: b.over_target })}`}
                    </p>
                  </div>
                  {spark.length > 1 && <Sparkline points={spark} width={72} height={26} />}
                </div>
                <p className="mt-2 border-t border-hairline pt-2 text-2xs text-ink-subtle ps-1.5">
                  {b.last_snapshot_at
                    ? `${t('menus.col.lastSnapshot')}: ${shortDate(b.last_snapshot_at, locale)}`
                    : t('menus.never')}
                </p>
              </Link>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}

function TrendCard({ data, t }: { data: Dashboard; t: T }) {
  const points = data.cost_trend.map((p) => ({
    label: p.label.split('·').pop()?.trim() ?? p.label,
    y: p.avg_food_cost_pct === null ? null : Number(p.avg_food_cost_pct),
  }))
  return (
    <Card elevated>
      <CardHeader title={t('dash.trend.title')} />
      <CardBody>
        {points.filter((p) => p.y !== null).length < 2 ? (
          <EmptyState icon="activity" title={t('menus.snapshots.empty')} />
        ) : (
          <TrendChart title="" points={points} target={30} format={(v) => `${v.toFixed(0)}%`} />
        )}
      </CardBody>
    </Card>
  )
}

function ActivityCard({ data, t, locale }: { data: Dashboard; t: T; locale: Locale }) {
  const actionIcon = (action: string): IconName =>
    action === 'created' ? 'plus' : action === 'recalculated' ? 'refresh' : 'edit'
  return (
    <Card elevated>
      <CardHeader title={t('dash.activity.title')} />
      <CardBody flush>
        {data.recent_activity.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="activity" title={t('dash.activity.empty')} />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.recent_activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
                  <Icon name={actionIcon(a.action)} size={12} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">
                    <span className="font-medium">{a.recipe_name}</span>
                    <span className="text-ink-subtle"> — {a.action_display.toLowerCase()}</span>
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {a.changed_by ?? 'system'} · {relativeTime(a.created_at, locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton className="col-span-2 h-[132px]" />
        <Skeleton className="h-[132px]" />
        <Skeleton className="h-[132px]" />
        <Skeleton className="col-span-2 h-[132px] lg:col-span-1" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}
