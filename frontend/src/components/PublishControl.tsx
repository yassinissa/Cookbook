import { Button } from './Button'
import { Card, CardBody, CardHeader } from './Card'
import { Icon } from './Icon'
import { relativeTime } from '@/lib/format'
import { useI18n } from '@/i18n'

/**
 * "Publish to inventory-platform" — a recipe-agnostic control for the dish /
 * production detail rail. The parent owns the mutation (toast, cache update);
 * this renders the status and fires `onPublish`.
 */
export function PublishControl({
  isPublished,
  publishedAt,
  publishStale,
  publishError,
  inventoryRecipeId,
  canPublish,
  busy,
  onPublish,
}: {
  isPublished: boolean
  publishedAt: string | null
  publishStale: boolean
  publishError: string
  inventoryRecipeId: string
  canPublish: boolean
  busy: boolean
  onPublish: () => void
}) {
  const { t, locale } = useI18n()

  if (!canPublish && !isPublished) return null

  return (
    <Card elevated rail={publishStale || publishError ? 'alert' : 'idle'}>
      <CardHeader title={t('publish.title')} />
      <CardBody className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {isPublished ? (
            publishStale ? (
              <>
                <Icon name="warning" size={15} className="flex-none text-warning-ink" />
                <span className="text-warning-ink">{t('publish.stale')}</span>
              </>
            ) : (
              <>
                <Icon name="check" size={15} className="flex-none text-success-ink" />
                <span className="text-ink-muted">
                  {publishedAt
                    ? t('publish.doneAt', { when: relativeTime(publishedAt, locale) })
                    : t('publish.done')}
                </span>
              </>
            )
          ) : (
            <>
              <span className="h-2 w-2 flex-none rounded-full bg-hairline-strong" />
              <span className="text-ink-subtle">{t('publish.never')}</span>
            </>
          )}
        </div>

        {inventoryRecipeId && (
          <p className="tnum font-mono text-2xs text-ink-subtle">inv #{inventoryRecipeId}</p>
        )}

        {publishError && (
          <p className="rounded-lg border border-danger-subtle bg-danger-subtle p-2.5 text-xs text-danger-ink">
            {publishError}
          </p>
        )}

        {canPublish && (
          <Button
            variant={isPublished ? 'secondary' : 'primary'}
            size="sm"
            icon="external"
            loading={busy}
            onClick={onPublish}
            className="w-full"
          >
            {busy
              ? t('publish.publishing')
              : isPublished
                ? t('publish.republish')
                : t('publish.publish')}
          </Button>
        )}
      </CardBody>
    </Card>
  )
}
