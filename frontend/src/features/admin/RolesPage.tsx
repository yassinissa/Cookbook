import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Input, Textarea } from '@/components/Input'
import { Page, PageHeader } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import { CapabilityChecklist } from './CapabilityChecklist'
import * as accounts from '@/lib/api/accounts'
import { useCapabilityGroups, useReference, useRoles } from '@/lib/queries'
import { parseApiError } from '@/lib/parseApiError'
import { useI18n } from '@/i18n'
import type { CapabilityCode, Role } from '@/types/access'

export function RolesPage() {
  const { t } = useI18n()
  const { data: roles, isLoading, isError, refetch } = useRoles()
  const [editing, setEditing] = useState<Role | 'new' | null>(null)

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('nav.section.admin')}
        title={t('nav.roles')}
        subtitle={t('roles.subtitle')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('roles.new')}
          </Button>
        }
      />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && <Skeleton className="h-64" />}

      {roles && roles.length === 0 && <EmptyState icon="shield" title={t('roles.empty')} />}

      {roles && roles.length > 0 && (
        <Card elevated rail="idle" className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-start transition-colors hover:bg-surface-sunken sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{r.name}</span>
                      {r.is_system && <Pill>{t('roles.system')}</Pill>}
                    </div>
                    <p className="truncate text-xs text-ink-subtle">{r.description}</p>
                  </div>
                  <span className="tnum text-xs text-ink-subtle">
                    {r.capability_codes.length} caps · {r.member_count} {t('roles.members')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && (
        <RoleDrawer
          role={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}

function RoleDrawer({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: groups = [] } = useCapabilityGroups()
  const { data: ref } = useReference()

  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [caps, setCaps] = useState<Set<CapabilityCode>>(new Set(role?.capability_codes ?? []))
  const [allBranches, setAllBranches] = useState(role?.grants_all_branches ?? true)
  const [allPrep, setAllPrep] = useState(role?.grants_all_prep_kitchens ?? true)
  const [branchIds, setBranchIds] = useState<string[]>(role?.default_branch_ids ?? [])
  const [prepIds, setPrepIds] = useState<string[]>(role?.default_prep_kitchen_ids ?? [])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        description,
        capability_codes: [...caps],
        grants_all_branches: allBranches,
        grants_all_prep_kitchens: allPrep,
        default_branch_ids: allBranches ? [] : branchIds,
        default_prep_kitchen_ids: allPrep ? [] : prepIds,
      }
      return role ? accounts.updateRole(role.id, payload) : accounts.createRole(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts', 'roles'] })
      toast.success(role ? t('roles.updated') : t('roles.created'))
      onClose()
    },
    onError: (e) => toast.error(parseApiError(e).message),
  })

  return (
    <Drawer
      open
      onClose={onClose}
      title={role ? role.name : t('roles.new')}
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label={t('roles.name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={role?.is_system} />
        </Field>
        <Field label={t('roles.description')}>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-hairline p-3">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('roles.defaultScope')}
          </p>
          <ScopeToggle
            label={t('roles.allBranches')}
            all={allBranches}
            onAll={setAllBranches}
            options={(ref?.branches ?? []).map((b) => ({ id: b.id, label: b.name_en }))}
            selected={branchIds}
            onSelected={setBranchIds}
          />
          <div className="mt-3">
            <ScopeToggle
              label={t('roles.allPrep')}
              all={allPrep}
              onAll={setAllPrep}
              options={(ref?.prepKitchens ?? []).map((p) => ({ id: p.id, label: p.name_en }))}
              selected={prepIds}
              onSelected={setPrepIds}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('roles.capabilities')}
          </p>
          <CapabilityChecklist
            groups={groups}
            selected={caps}
            mode="role"
            onToggle={(code) =>
              setCaps((s) => {
                const next = new Set(s)
                next.has(code) ? next.delete(code) : next.add(code)
                return next
              })
            }
          />
        </div>
      </div>
    </Drawer>
  )
}

function ScopeToggle({
  label,
  all,
  onAll,
  options,
  selected,
  onSelected,
}: {
  label: string
  all: boolean
  onAll: (v: boolean) => void
  options: { id: string; label: string }[]
  selected: string[]
  onSelected: (v: string[]) => void
}) {
  const { t } = useI18n()
  return (
    <div>
      <label className="flex items-center gap-2 text-[13px] text-ink-muted">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-hairline-strong text-accent"
          checked={all}
          onChange={(e) => onAll(e.target.checked)}
        />
        {label}
      </label>
      {!all && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = selected.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelected(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
                className={
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ' +
                  (on ? 'border-accent bg-accent text-white' : 'border-hairline-strong text-ink-muted hover:bg-surface-sunken')
                }
              >
                {o.label}
              </button>
            )
          })}
          {options.length === 0 && <span className="text-xs text-ink-subtle">{t('state.empty')}</span>}
        </div>
      )}
    </div>
  )
}
