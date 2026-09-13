import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { useProductionRecipe } from '@/lib/queries'
import { useI18n } from '@/i18n'

/* Read-only "how do I make this batch" card for prep kitchen floor staff —
 * yield, ingredients, method. No cost, no edit/delete/publish controls;
 * those live on the regular Production detail page. */
export function KitchenProductionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { data: recipe, isLoading, isError, refetch } = useProductionRecipe(id)

  if (isLoading) return <DetailSkeleton />
  if (isError || !recipe) {
    return (
      <Page>
        <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />
      </Page>
    )
  }

  const unitCode = recipe.output_unit?.code ?? ''
  const meta = [recipe.prep_kitchen, recipe.section?.name].filter(Boolean).join('  ·  ')

  return (
    <Page stagger>
      <div className="mb-4 no-print">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/kitchen')}>
          {t('kitchen.title')}
        </Button>
      </div>

      <Card elevated rail="idle" className="relative mb-6 overflow-hidden">
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <CardBody className="flex items-center gap-4">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
            <Icon name="production" size={26} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[1.6rem] font-medium tracking-tight text-ink">
              {recipe.name_en}
            </h1>
            {recipe.name_ar && (
              <p dir="rtl" className="mt-0.5 text-sm text-ink-subtle">
                {recipe.name_ar}
              </p>
            )}
            {meta && <p className="mt-1 font-mono text-xs text-ink-subtle">{meta}</p>}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-6">
        <Card elevated>
          <CardHeader
            title={t('production.yield.title')}
            subtitle={t('production.yield.batchOf', { qty: recipe.output_qty, unit: unitCode })}
          />
        </Card>

        <Card elevated>
          <CardHeader title={t('editor.section.ingredients')} />
          <CardBody flush>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                {recipe.ingredients.map((i) => (
                  <tr key={i.id ?? i.item_sku}>
                    <td className="px-4 py-2.5 text-ink">
                      {i.item_name_snapshot}
                      {i.prep_note && <span className="text-ink-subtle"> · {i.prep_note}</span>}
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-2.5 text-end font-mono text-ink-muted">
                      {i.quantity} {i.unit_detail?.code ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card elevated>
          <CardHeader title={t('editor.section.method')} />
          <CardBody>
            <ol className="space-y-3">
              {recipe.steps.map((s) => (
                <li key={s.id ?? s.step_number} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-sunken font-mono text-xs font-semibold text-ink-subtle">
                    {s.step_number}
                  </span>
                  <p className="pt-0.5 leading-relaxed text-ink">{s.instruction}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </Page>
  )
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-24 w-full rounded-card" />
      <div className="space-y-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </Page>
  )
}
