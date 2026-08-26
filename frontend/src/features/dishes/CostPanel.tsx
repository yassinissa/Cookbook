import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Meter } from '@/components/Meter'
import { foodCostBand } from '@/lib/format'
import { kwd, percent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n'
import type { CostBreakdown } from '@/types/api'

function isBreakdown(b: unknown): b is CostBreakdown {
  return !!b && typeof b === 'object' && 'per_serving' in b
}

export function CostPanel({
  breakdown,
  sellingPrice,
  onRecalculate,
  recalculating,
}: {
  breakdown: CostBreakdown | Record<string, never> | null | undefined
  sellingPrice?: string | null
  onRecalculate?: () => void
  recalculating?: boolean
}) {
  const { t } = useI18n()
  const bd = isBreakdown(breakdown) ? breakdown : null

  if (!bd) {
    return (
      <Card>
        <CardHeader title={t('cost.title')} />
        <CardBody>
          <p className="text-sm text-ink-subtle">{t('cost.empty')}</p>
        </CardBody>
      </Card>
    )
  }

  const fcp = bd.food_cost_pct === null ? null : Number(bd.food_cost_pct)
  const band = foodCostBand(fcp)
  const issues = bd.issues ?? []
  const sp = sellingPrice ? Number(sellingPrice) : null
  const nearest =
    sp === null || !bd.scenarios?.length
      ? -1
      : bd.scenarios.reduce(
          (best, s, i) =>
            Math.abs(Number(s.price) - sp) < Math.abs(Number(bd.scenarios[best].price) - sp)
              ? i
              : best,
          0,
        )

  return (
    <Card>
      <CardHeader
        title={t('cost.title')}
        action={
          onRecalculate && (
            <Button size="sm" variant="secondary" icon="refresh" loading={recalculating} onClick={onRecalculate}>
              {recalculating ? t('action.recalculating') : t('action.recalculate')}
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={t('cost.tile.ingredients')} value={bd.items} />
          <Tile label={t('cost.tile.waste')} value={bd.waste} />
          <Tile label={t('cost.tile.labour')} value={bd.labor} />
          <Tile label={t('cost.tile.perServing')} value={bd.per_serving} accent />
        </div>

        {fcp !== null && band && (
          <div>
            <Meter
              value={fcp}
              bandLabel={(b) => t(`cost.band.${b}`)}
            />
            {bd.revenue_pct !== null && (
              <p className="mt-1.5 text-xs text-ink-subtle">
                {t('cost.grossMargin', { pct: percent(bd.revenue_pct) })}
              </p>
            )}
          </div>
        )}

        {issues.length > 0 && (
          <div className="rounded-lg border border-warning-subtle bg-warning-subtle p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-ink">
              <Icon name="warning" size={13} />
              {issues.length === 1
                ? t('cost.notCostedOne')
                : t('cost.notCosted', { n: issues.length })}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-warning-ink/90">
              {issues.map((iss, i) => (
                <li key={i}>
                  <span className="tnum font-medium">{iss.sku}</span> —{' '}
                  {iss.detail || iss.status.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {bd.scenarios?.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t('cost.scenarios')}
            </h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="py-1 text-start font-medium">{t('cost.scenarios.markup')}</th>
                  <th className="py-1 text-end font-medium">{t('cost.scenarios.price')}</th>
                  <th className="py-1 text-end font-medium">{t('cost.scenarios.foodCost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {bd.scenarios.map((s, i) => (
                  <tr key={s.markup} className={cn(i === nearest && 'bg-accent-subtle')}>
                    <td className="tnum py-1.5 text-ink-subtle">×{s.markup}</td>
                    <td className="tnum py-1.5 text-end text-ink">{kwd(s.price)}</td>
                    <td className="tnum py-1.5 text-end text-ink-subtle">{percent(s.cost_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sp !== null && (
              <p className="mt-1.5 text-xs text-ink-subtle">
                {t('cost.scenarios.nearest', { price: kwd(sp) })}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Tile({ label, value, accent }: { label: string; value: string | null; accent?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        accent ? 'border-accent/40 bg-accent-subtle' : 'border-hairline bg-surface-sunken',
      )}
    >
      <div className="text-2xs uppercase tracking-wide text-ink-subtle">{label}</div>
      <div
        className={cn(
          'tnum mt-0.5',
          accent ? 'text-lg font-semibold text-accent-ink' : 'text-sm text-ink',
        )}
      >
        {kwd(value)}
        <span className="ms-1 text-[10px] font-normal text-ink-subtle">KWD</span>
      </div>
    </div>
  )
}

/** Per-ingredient computed cost / warning chip, for the ingredient rows. */
export function LineCostChip({
  line,
}: {
  line: { amount: string | null; status: string; detail?: string } | undefined
}) {
  const { t } = useI18n()
  if (!line) return <span className="text-2xs text-ink-subtle">—</span>
  if (line.status === 'ok') {
    return <span className="tnum text-xs text-ink-subtle">{kwd(line.amount)}</span>
  }
  const label =
    { no_price: 'no price', no_conversion: 'no conversion', unknown_sku: 'unknown SKU' }[
      line.status
    ] ?? line.status
  return (
    <span
      className="inline-flex items-center gap-1 text-2xs font-medium text-warning-ink"
      title={line.detail || label}
    >
      <Icon name="warning" size={11} />
      {label}
      <span className="sr-only">{t('cost.notCostedOne')}</span>
    </span>
  )
}
