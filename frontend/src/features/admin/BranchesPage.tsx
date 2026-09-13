import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { Page, PageHeader } from '@/components/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import { useReference } from '@/lib/queries'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { useI18n } from '@/i18n'
import type { Branch } from '@/types/api'

export function BranchesPage() {
  const { t } = useI18n()
  const { data: ref, isLoading, isError, refetch } = useReference()
  const branches = ref?.branches
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('nav.section.admin')}
        title={t('nav.branches')}
        subtitle={t('branches.subtitle')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('branches.new')}
          </Button>
        }
      />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && <Skeleton className="h-64" />}

      {branches && branches.length === 0 && <EmptyState icon="store" title={t('branches.empty')} />}

      {branches && branches.length > 0 && (
        <Card elevated rail="idle" className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {branches.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setEditing(b)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-start transition-colors hover:bg-surface-sunken sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{b.name_en}</span>
                      {b.name_ar && (
                        <span className="text-xs text-ink-subtle" dir="rtl">
                          {b.name_ar}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-2xs text-ink-subtle">{b.slug}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && <BranchDrawer branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}

function BranchDrawer({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()

  const [nameEn, setNameEn] = useState(branch?.name_en ?? '')
  const [nameAr, setNameAr] = useState(branch?.name_ar ?? '')
  const [sortOrder, setSortOrder] = useState(branch?.sort_order ?? 0)

  const save = useMutation({
    mutationFn: () => {
      const payload = { name_en: nameEn, name_ar: nameAr, sort_order: sortOrder }
      return branch ? api.updateBranch(branch.id, payload) : api.createBranch(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reference })
      toast.success(branch ? t('branches.updated') : t('branches.created'))
      onClose()
    },
    onError: (e) => toast.error(parseApiError(e).message),
  })

  return (
    <Drawer
      open
      onClose={onClose}
      title={branch ? branch.name_en : t('branches.new')}
      width="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button size="sm" variant="primary" loading={save.isPending} disabled={!nameEn.trim()} onClick={() => save.mutate()}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label={t('branches.name')} required>
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={t('branches.nameAr')}>
          <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
        <Field label={t('branches.sortOrder')}>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </Field>

        <div className="rounded-lg border border-hairline p-3">
          <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('branches.brandKey')}
          </p>
          {branch ? (
            <>
              <p className="font-mono text-sm text-ink">{branch.slug}</p>
              <p className="mt-1 text-xs text-ink-subtle">{t('branches.brandKeyExistingHint')}</p>
            </>
          ) : (
            <p className="text-xs text-ink-subtle">{t('branches.brandKeyNewHint')}</p>
          )}
        </div>
      </div>
    </Drawer>
  )
}
