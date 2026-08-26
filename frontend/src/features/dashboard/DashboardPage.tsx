import { Link } from 'react-router-dom'

import { Card, CardBody, CardHeader } from '@/components/Card'
import { Sparkline, TrendChart } from '@/components/Charts'
import { FoodCostValue, Meter } from '@/components/Meter'
import { Icon, type IconName } from '@/components/Icon'
import { Page, PageHeader, BiName } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useDashboard } from '@/lib/queries'
import { percent, relativeTime, shortDate } from '@/lib/format'
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
        <div className="space-y-6">
          <KpiRow data={data} t={t} />
          <div className="grid gap-6 lg:grid-cols-2">
            <AttentionCard data={data} t={t} />
            <OverTargetCard data={data} t={t} />
          </div>
          <BranchHealthCard data={data} t={t} locale={locale} />
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
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
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Kpi label={t('dash.kpi.dishes')} value={String(data.totals.dishes)} />
      <Kpi label={t('dash.kpi.avgFoodCost')} value={percent(data.food_cost.avg_pct)} spark={trend} />
      <Kpi
        label={t('dash.kpi.overTarget')}
        value={String(data.food_cost.over_target)}
        tone={data.food_cost.over_target > 0 ? 'warning' : 'default'}
      />
      <Kpi label={t('dash.kpi.menus')} value={String(data.totals.menus)} />
    </div>
  )
}

function Kpi({
  label,
  value,
  spark,
  tone = 'default',
}: {
  label: string
  value: string
  spark?: number[]
  tone?: 'default' | 'warning'
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span
          className={
            'tnum text-2xl font-semibold ' + (tone === 'warning' ? 'text-warning-ink' : 'text-ink')
          }
        >
          {value}
        </span>
        {spark && spark.length > 1 && <Sparkline points={spark} />}
      </div>
    </Card>
  )
}

function AttentionCard({ data, t }: { data: Dashboard; t: T }) {
  return (
    <Card>
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
      <CardBody className="p-0">
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
                  <span className="tnum flex-none text-xs text-ink-subtle">#{item.recipe_code}</span>
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
    <Card>
      <CardHeader title={t('dash.overTarget.title')} />
      <CardBody className="p-0">
        {data.over_target.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="check" title={t('dash.overTarget.empty')} />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.over_target.slice(0, 6).map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/recipes/dishes/${d.id}`}
                    className="text-[13px] font-medium text-ink hover:text-accent-ink"
                  >
                    {d.name_en}
                  </Link>
                  <p className="text-xs text-ink-subtle">{d.branch}</p>
                </div>
                <div className="w-24 flex-none">
                  <Meter value={Number(d.food_cost_pct)} size="sm" showTarget={false} />
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
    <Card>
      <CardHeader title={t('dash.branchHealth.title')} />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.branch_health.map((b) => {
            const spark = b.trend
              .map((p) => Number(p.avg_food_cost_pct))
              .filter((n) => !Number.isNaN(n))
            return (
              <Link
                key={b.branch_id}
                to={`/menus/${b.branch_id}`}
                className="group flex flex-col rounded-lg border border-hairline p-3 transition-colors hover:border-hairline-strong hover:bg-surface-sunken"
              >
                <div className="flex items-start justify-between">
                  <BiName en={b.name_en} ar={b.name_ar} className="text-[13px] font-medium" />
                  <Icon
                    name="chevronRight"
                    size={14}
                    className="mt-0.5 text-ink-subtle transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                  />
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <FoodCostValue value={b.avg_food_cost_pct} />
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {b.dishes} dishes{b.over_target > 0 && ` · ${b.over_target} over`}
                    </p>
                  </div>
                  {spark.length > 1 && <Sparkline points={spark} width={72} height={24} />}
                </div>
                <p className="mt-2 border-t border-hairline pt-2 text-2xs text-ink-subtle">
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
    <Card>
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
    <Card>
      <CardHeader title={t('dash.activity.title')} />
      <CardBody className="p-0">
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}
