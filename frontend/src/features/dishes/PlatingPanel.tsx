import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { EmptyState, Skeleton } from '@/components/States'
import { PinnedImage } from '@/components/PinnedImage'
import { usePlatingGuide } from '@/lib/queries'
import { shortDate } from '@/lib/format'
import { useI18n, type TFunc } from '@/i18n'

function formatPickupWindow(seconds: number | null | undefined, t: TFunc) {
  if (seconds == null) return null
  if (seconds < 60) return t('plating.window.seconds', { n: seconds })
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? t('plating.window.minutes', { n: m }) : t('plating.window.minsec', { m, s })
}

export function PlatingPanel({ dishId, canEdit }: { dishId: string; canEdit: boolean }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { data, isLoading, isError } = usePlatingGuide(dishId)

  const edit = (
    <Button
      variant={data?.plating ? 'secondary' : 'primary'}
      size="sm"
      icon={data?.plating ? 'edit' : 'plus'}
      onClick={() => navigate(`/recipes/dishes/${dishId}/plating`)}
    >
      {data?.plating ? t('action.edit') : t('plating.add')}
    </Button>
  )

  if (isLoading) {
    return (
      <Card elevated>
        <CardHeader title={t('plating.title')} />
        <CardBody>
          <Skeleton className="aspect-[16/10] w-full" />
        </CardBody>
      </Card>
    )
  }

  if (isError) return null

  const g = data?.plating

  if (!g) {
    return (
      <Card elevated>
        <CardHeader title={t('plating.title')} />
        <CardBody>
          <EmptyState
            icon="camera"
            title={t('plating.empty.title')}
            body={canEdit ? t('plating.empty.bodyEdit') : t('plating.empty.body')}
            action={
              canEdit
                ? {
                    label: t('plating.add'),
                    icon: 'plus',
                    onClick: () => navigate(`/recipes/dishes/${dishId}/plating`),
                  }
                : undefined
            }
          />
        </CardBody>
      </Card>
    )
  }

  const window = formatPickupWindow(g.pickup_window_seconds, t)
  const garnish = locale === 'ar' ? g.garnish_spec_ar || g.garnish_spec_en : g.garnish_spec_en
  const build = locale === 'ar' ? g.build_notes_ar || g.build_notes_en : g.build_notes_en
  const errors = locale === 'ar' ? g.common_errors_ar || g.common_errors_en : g.common_errors_en

  return (
    <Card elevated>
      <CardHeader
        title={t('plating.title')}
        subtitle={g.plate_spec || undefined}
        action={canEdit ? edit : undefined}
      />
      <CardBody className="space-y-5">
        {g.images.length > 0 && (
          <div className="space-y-5">
            {g.images.map((img) => (
              <figure key={img.id} className="space-y-2">
                <PinnedImage
                  src={img.image_url}
                  alt={data!.name_en}
                  pins={img.pins}
                  locale={locale}
                />
                {(img.caption_en || img.caption_ar) && (
                  <figcaption className="text-xs text-ink-subtle">
                    {locale === 'ar' ? img.caption_ar || img.caption_en : img.caption_en || img.caption_ar}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}

        <dl className="space-y-3 text-sm">
          {window && (
            <Row label={t('plating.field.window')}>
              <span className="tnum font-mono text-ink">{window}</span>
            </Row>
          )}
          {garnish && <Row label={t('plating.field.garnish')} block>{garnish}</Row>}
          {build && <Row label={t('plating.field.build')} block>{build}</Row>}
          {errors && (
            <Row label={t('plating.field.errors')} block>
              <span className="text-danger-ink">{errors}</span>
            </Row>
          )}
        </dl>

        <p className="border-t border-hairline pt-3 text-xs text-ink-subtle">
          {t('plating.updated', { date: shortDate(g.updated_at, locale) })}
        </p>
      </CardBody>
    </Card>
  )
}

function Row({
  label,
  block,
  children,
}: {
  label: string
  block?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={block ? 'space-y-1' : 'flex items-baseline justify-between gap-4'}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-ink-subtle">{label}</dt>
      <dd className={block ? 'whitespace-pre-line leading-relaxed text-ink' : 'text-ink'}>{children}</dd>
    </div>
  )
}
