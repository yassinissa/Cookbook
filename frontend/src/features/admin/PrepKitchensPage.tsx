import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Input, Select } from '@/components/Input'
import { Page, PageHeader } from '@/components/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import { useInventoryProductionStores, useReference } from '@/lib/queries'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { useI18n } from '@/i18n'
import type { PrepKitchen } from '@/types/api'

export function PrepKitchensPage() {
  const { t } = useI18n()
  const { data: ref, isLoading, isError, refetch } = useReference()
  const prepKitchens = ref?.prepKitchens
  const [editing, setEditing] = useState<PrepKitchen | 'new' | null>(null)

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('nav.section.admin')}
        title={t('nav.prepKitchens')}
        subtitle={t('prepKitchens.subtitle')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('prepKitchens.new')}
          </Button>
        }
      />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && <Skeleton className="h-64" />}

      {prepKitchens && prepKitchens.length === 0 && (
        <EmptyState icon="production" title={t('prepKitchens.empty')} />
      )}

      {prepKitchens && prepKitchens.length > 0 && (
        <Card elevated rail="idle" className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {prepKitchens.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setEditing(k)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-start transition-colors hover:bg-surface-sunken sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{k.name_en}</span>
                      {k.name_ar && (
                        <span className="text-xs text-ink-subtle" dir="rtl">
                          {k.name_ar}
                        </span>
                      )}
                      {k.code && <span className="font-mono text-2xs text-ink-subtle">{k.code}</span>}
                    </div>
                    {!k.inventory_store_id && (
                      <p className="mt-0.5 text-2xs text-warning-ink">
                        {t('prepKitchens.inventoryStoreIdMissing')}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && (
        <PrepKitchenDrawer prepKitchen={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </Page>
  )
}

function PrepKitchenDrawer({ prepKitchen, onClose }: { prepKitchen: PrepKitchen | null; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const stores = useInventoryProductionStores()

  const [nameEn, setNameEn] = useState(prepKitchen?.name_en ?? '')
  const [nameAr, setNameAr] = useState(prepKitchen?.name_ar ?? '')
  const [code, setCode] = useState(prepKitchen?.code ?? '')
  const [sortOrder, setSortOrder] = useState(prepKitchen?.sort_order ?? 0)
  const [inventoryStoreId, setInventoryStoreId] = useState(prepKitchen?.inventory_store_id ?? '')
  // The picker needs a manual-entry escape hatch — inventory-platform can be
  // slow/cold (see apps/integrations/inventory_client.py) or briefly down,
  // and a saved-but-deactivated store id must stay visible/editable either way.
  const [manualEntry, setManualEntry] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name_en: nameEn,
        name_ar: nameAr,
        code,
        sort_order: sortOrder,
        inventory_store_id: inventoryStoreId,
      }
      return prepKitchen ? api.updatePrepKitchen(prepKitchen.id, payload) : api.createPrepKitchen(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reference })
      toast.success(prepKitchen ? t('prepKitchens.updated') : t('prepKitchens.created'))
      onClose()
    },
    onError: (e) => toast.error(parseApiError(e).message),
  })

  return (
    <Drawer
      open
      onClose={onClose}
      title={prepKitchen ? prepKitchen.name_en : t('prepKitchens.new')}
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
        <Field label={t('prepKitchens.name')} required>
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={t('prepKitchens.nameAr')}>
          <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
        <Field label={t('prepKitchens.code')}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label={t('prepKitchens.sortOrder')}>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </Field>

        <div className="rounded-lg border border-hairline p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t('prepKitchens.inventoryLink')}
            </p>
            {!stores.isError && (
              <button
                type="button"
                className="text-2xs font-medium text-accent hover:underline"
                onClick={() => setManualEntry((v) => !v)}
              >
                {manualEntry ? t('prepKitchens.inventoryPickFromList') : t('prepKitchens.inventoryEnterManually')}
              </button>
            )}
          </div>

          {stores.isError || manualEntry ? (
            <Field
              label={t('prepKitchens.inventoryStoreId')}
              help={stores.isError ? t('prepKitchens.inventoryStoreIdOffline') : undefined}
            >
              <Input
                value={inventoryStoreId}
                onChange={(e) => setInventoryStoreId(e.target.value)}
                className="font-mono"
              />
            </Field>
          ) : (
            <Field label={t('prepKitchens.inventoryStoreId')}>
              <Select
                disabled={stores.isLoading}
                value={inventoryStoreId}
                onChange={(e) => setInventoryStoreId(e.target.value)}
              >
                <option value="">
                  {stores.isLoading ? t('prepKitchens.inventoryStoreIdLoading') : t('prepKitchens.inventoryStoreIdNone')}
                </option>
                {inventoryStoreId && !stores.data?.some((s) => s.id === inventoryStoreId) && (
                  <option value={inventoryStoreId}>{t('prepKitchens.inventoryStoreIdUnknown')} ({inventoryStoreId})</option>
                )}
                {stores.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_en}
                    {s.name_ar ? ` · ${s.name_ar}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {stores.isError && (
            <button
              type="button"
              className="mt-1 text-2xs font-medium text-accent hover:underline"
              onClick={() => stores.refetch()}
            >
              {t('action.retry')}
            </button>
          )}

          <p className="mt-1 text-xs text-ink-subtle">
            {inventoryStoreId ? t('prepKitchens.inventoryStoreIdHint') : t('prepKitchens.inventoryStoreIdMissing')}
          </p>
        </div>
      </div>
    </Drawer>
  )
}
