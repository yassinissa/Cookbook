import { http, USE_SEED } from '@/lib/http'
import { seedIdentity } from '@/lib/seed/access'
import { SEED_ACCOUNT_USERS, SEED_CAPABILITY_GROUPS, SEED_ROLES } from '@/lib/seed/adminData'
import type { AccountUser, CapabilityGroup, Me, Role } from '@/types/access'

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms))

export async function fetchMe(): Promise<Me> {
  if (USE_SEED) return seedIdentity().me
  const { data } = await http.get('/auth/me/')
  return data
}

/* ── admin: capabilities / roles / users ────────────────────────────── */
export async function fetchCapabilityGroups(): Promise<CapabilityGroup[]> {
  if (USE_SEED) return SEED_CAPABILITY_GROUPS
  const { data } = await http.get('/accounts/capabilities/?grouped=1')
  return data
}

export async function fetchRoles(): Promise<Role[]> {
  if (USE_SEED) {
    await wait()
    return SEED_ROLES
  }
  const { data } = await http.get('/accounts/roles/')
  return data
}
export async function createRole(payload: Partial<Role>): Promise<Role> {
  if (USE_SEED) return { ...SEED_ROLES[0], ...payload, id: `role-${Date.now()}`, is_system: false }
  const { data } = await http.post('/accounts/roles/', payload)
  return data
}
export async function updateRole(id: string, payload: Partial<Role>): Promise<Role> {
  if (USE_SEED) return { ...(SEED_ROLES.find((r) => r.id === id) ?? SEED_ROLES[0]), ...payload }
  const { data } = await http.patch(`/accounts/roles/${id}/`, payload)
  return data
}
export async function deleteRole(id: string): Promise<void> {
  if (USE_SEED) return
  await http.delete(`/accounts/roles/${id}/`)
}

export async function fetchAccountUsers(): Promise<AccountUser[]> {
  if (USE_SEED) {
    await wait()
    return SEED_ACCOUNT_USERS
  }
  const { data } = await http.get('/accounts/users/')
  return data
}
export async function createAccountUser(payload: Record<string, unknown>): Promise<AccountUser> {
  if (USE_SEED) return { ...SEED_ACCOUNT_USERS[1], ...(payload as Partial<AccountUser>), id: Date.now() }
  const { data } = await http.post('/accounts/users/', payload)
  return data
}
export async function updateAccountUser(
  id: number,
  payload: Record<string, unknown>,
): Promise<AccountUser> {
  if (USE_SEED) {
    return {
      ...(SEED_ACCOUNT_USERS.find((u) => u.id === id) ?? SEED_ACCOUNT_USERS[1]),
      ...(payload as Partial<AccountUser>),
    }
  }
  const { data } = await http.patch(`/accounts/users/${id}/`, payload)
  return data
}
