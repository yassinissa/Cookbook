import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Input, Select } from '@/components/Input'
import { Page, PageHeader } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import { CapabilityChecklist } from './CapabilityChecklist'
import * as accounts from '@/lib/api/accounts'
import { useAccountUsers, useCapabilityGroups, useReference, useRoles } from '@/lib/queries'
import { parseApiError } from '@/lib/parseApiError'
import { useI18n } from '@/i18n'
import type { AccountUser, CapabilityCode, Role } from '@/types/access'

export function UsersPage() {
  const { t } = useI18n()
  const { data: users, isLoading, isError, refetch } = useAccountUsers()
  const { data: roles = [] } = useRoles()
  const [editing, setEditing] = useState<AccountUser | 'new' | null>(null)

  return (
    <Page>
      <PageHeader
        eyebrow={t('nav.section.admin')}
        title={t('nav.users')}
        subtitle={t('users.subtitle')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('users.new')}
          </Button>
        }
      />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && <Skeleton className="h-64" />}
      {users && users.length === 0 && <EmptyState icon="users" title={t('users.empty')} />}

      {users && users.length > 0 && (
        <Card className="overflow-hidden">
          <div className="scroll-x">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-[11px] uppercase tracking-[0.06em] text-ink-subtle">
                  <th className="px-4 py-2.5 text-start font-semibold">{t('users.col.name')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{t('users.col.role')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{t('users.col.scope')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{t('users.col.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setEditing(u)}
                    className="cursor-pointer transition-colors hover:bg-surface-sunken"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-ink">{u.display_name || u.username}</span>
                      <span className="ms-2 text-xs text-ink-subtle">@{u.username}</span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {u.role_name ?? '—'}
                      {u.is_superuser && <Pill tone="accent" className="ms-2">super</Pill>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-subtle">{scopeSummary(u)}</td>
                    <td className="px-3 py-2.5">
                      {u.is_active && u.is_membership_active ? (
                        <Pill tone="success" icon="check">{t('users.active')}</Pill>
                      ) : (
                        <Pill tone="danger" icon="alert">{t('users.inactive')}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <UserDrawer
          user={editing === 'new' ? null : editing}
          roles={roles}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}

function scopeSummary(u: AccountUser): string {
  const b = u.effective_scope.branches
  const p = u.effective_scope.prep_kitchens
  const parts: string[] = []
  parts.push(b === 'all' ? 'All branches' : `${b.length} branch${b.length === 1 ? '' : 'es'}`)
  if (p === 'all' || p.length) parts.push(p === 'all' ? 'all prep' : `${p.length} prep`)
  return parts.join(' · ')
}

function UserDrawer({
  user,
  roles,
  onClose,
}: {
  user: AccountUser | null
  roles: Role[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: groups = [] } = useCapabilityGroups()
  const { data: ref } = useReference()

  const [username, setUsername] = useState(user?.username ?? '')
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState(user?.role_id ?? '')
  const [override, setOverride] = useState(user?.scope_overridden ?? false)
  const [branchIds, setBranchIds] = useState<string[]>(user?.branch_ids ?? [])
  const [prepIds, setPrepIds] = useState<string[]>(user?.prep_kitchen_ids ?? [])
  const [extra, setExtra] = useState<Set<CapabilityCode>>(new Set(user?.extra_capability_codes ?? []))
  const [denied, setDenied] = useState<Set<CapabilityCode>>(new Set(user?.denied_capability_codes ?? []))

  const inherited = useMemo(
    () => new Set(roles.find((r) => r.id === roleId)?.capability_codes ?? []),
    [roles, roleId],
  )

  function toggleCap(code: CapabilityCode) {
    // inherited: on → denied → on ;  not inherited: off → granted → off
    if (inherited.has(code)) {
      setDenied((s) => {
        const next = new Set(s)
        next.has(code) ? next.delete(code) : next.add(code)
        return next
      })
    } else {
      setExtra((s) => {
        const next = new Set(s)
        next.has(code) ? next.delete(code) : next.add(code)
        return next
      })
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        username,
        display_name: displayName,
        role_id: roleId || null,
        scope_overridden: override,
        branch_ids: override ? branchIds : [],
        prep_kitchen_ids: override ? prepIds : [],
        extra_capability_codes: [...extra],
        denied_capability_codes: [...denied],
      }
      if (password) payload.password = password
      return user
        ? accounts.updateAccountUser(user.id, payload)
        : accounts.createAccountUser(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts', 'users'] })
      toast.success(user ? t('users.updated') : t('users.created'))
      onClose()
    },
    onError: (e) => toast.error(parseApiError(e).message),
  })

  return (
    <Drawer
      open
      onClose={onClose}
      title={user ? user.display_name || user.username : t('users.new')}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('users.username')} required>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!!user} />
          </Field>
          <Field label={t('users.displayName')}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field
            label={t('users.password')}
            help={user ? t('users.passwordHelpEdit') : t('users.passwordHelpNew')}
          >
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t('users.role')}>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">— {t('users.noRole')} —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-lg border border-hairline p-3">
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-hairline-strong text-accent"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            {t('users.overrideScope')}
          </label>
          {override && (
            <div className="mt-3 space-y-3">
              <PillPicker
                label={t('dishes.filter.branch')}
                options={(ref?.branches ?? []).map((b) => ({ id: b.id, label: b.name_en }))}
                selected={branchIds}
                onChange={setBranchIds}
              />
              <PillPicker
                label={t('editor.field.station')}
                options={(ref?.prepKitchens ?? []).map((p) => ({ id: p.id, label: p.name_en }))}
                selected={prepIds}
                onChange={setPrepIds}
              />
            </div>
          )}
          {!override && (
            <p className="mt-1.5 text-xs text-ink-subtle">{t('users.scopeInherited')}</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('users.permissions')}
          </p>
          <p className="mb-2 text-xs text-ink-subtle">{t('users.permissionsHelp')}</p>
          <CapabilityChecklist
            groups={groups}
            selected={extra}
            inherited={inherited}
            denied={denied}
            mode="user"
            onToggle={toggleCap}
          />
        </div>
      </div>
    </Drawer>
  )
}

function PillPicker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <div>
      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
              className={
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ' +
                (on ? 'border-accent bg-accent text-white' : 'border-hairline-strong text-ink-muted hover:bg-surface-sunken')
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
