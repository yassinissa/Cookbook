import { useRouteError } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Page } from '@/components/Page'

export function RouteError() {
  const error = useRouteError()
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected error'

  return (
    <Page>
      <div className="mx-auto max-w-md rounded-card border border-hairline bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This screen hit an error</h1>
        <p className="mt-2 text-sm text-ink-subtle">{message}</p>
        <Button
          variant="primary"
          className="mt-5"
          icon="refresh"
          onClick={() => window.location.assign('/')}
        >
          Back to dashboard
        </Button>
      </div>
    </Page>
  )
}
