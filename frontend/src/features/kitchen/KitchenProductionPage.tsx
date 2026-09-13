import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { useProductionRecipe } from '@/lib/queries'
import { useI18n } from '@/i18n'

/* The staff guide for one production batch — yield, ingredients, method.
 * Read-only: no cost, no edit/delete/publish controls; those live on the
 * regular Production detail page. */
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

  const glance: { label: string; value: string }[] = [
    { label: t('kitchen.glance.yield'), value: `${recipe.output_qty} ${unitCode}`.trim() },
  ]
  if (recipe.section?.name) glance.push({ label: t('kitchen.glance.station'), value: recipe.section.name })
  if (recipe.prep_time_minutes)
    glance.push({ label: t('kitchen.glance.prepTime'), value: t('kitchen.glance.minutes', { n: recipe.prep_time_minutes }) })

  return (
    <Page stagger>
      <div className="mb-4 no-print">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/kitchen')}>
          {t('kitchen.title')}
        </Button>
      </div>

      <div className="card-lit relative mb-6 overflow-hidden rounded-card border border-hairline">
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <div className="flex items-center gap-4 p-4 sm:p-6">
          <span className="spice-rail flex h-14 w-14 flex-none items-center justify-center rounded-full text-white">
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
            {recipe.prep_kitchen && (
              <p className="mt-1 font-mono text-xs text-ink-subtle">{recipe.prep_kitchen}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
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
              <ol className="space-y-4">
                {recipe.steps.map((s) => (
                  <li key={s.id ?? s.step_number} className="flex gap-3.5 text-sm">
                    <span className="spice-rail flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-xs font-semibold text-white">
                      {s.step_number}
                    </span>
                    <p className="pt-0.5 leading-relaxed text-ink">{s.instruction}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card elevated rail="idle">
            <CardHeader title={t('kitchen.glance')} />
            <CardBody className="space-y-2.5">
              {glance.map((g) => (
                <div key={g.label} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-subtle">{g.label}</span>
                  <span className="font-medium text-ink">{g.value}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  )
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-24 w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-40" />
      </div>
    </Page>
  )
}
