import type { AccountUser, CapabilityGroup, Role } from '@/types/access'
import { CAPABILITIES } from './capabilityCatalogue'
import { BRANCHES } from './catalog'

export const SEED_CAPABILITY_GROUPS: CapabilityGroup[] = (() => {
  const groups = Array.from(new Set(CAPABILITIES.map((c) => c.group)))
  return groups.map((group) => ({
    group,
    capabilities: CAPABILITIES.filter((c) => c.group === group).map((c, i) => ({
      id: `cap-${group}-${i}`,
      code: c.code,
      label: c.label,
      group,
      description: '',
    })),
  }))
})()

const allCodes = CAPABILITIES.map((c) => c.code)
const salmiya = BRANCHES.find((b) => b.id === 'br-salmiya')!

export const SEED_ROLES: Role[] = [
  role('Administrator', 'Full access, incl. user & role management.', allCodes, true, true, true, 1),
  role('Executive Chef', 'Authors and approves recipes group-wide.',
    allCodes.filter((c) => !c.startsWith('admin.')), true, true, true, 3),
  role('QA Manager', 'Owns the QA / QC dish standards.',
    ['dashboard.view', 'dish.view', 'recipe.history', 'production.view', 'menu.view', 'standard.view', 'standard.edit', 'nutrition.view', 'inventory.view', 'activity.view'],
    true, true, true, 2),
  role('Cost Controller', 'Owns costing and pricing.',
    ['dashboard.view', 'dish.view', 'recipe.history', 'production.view', 'menu.view', 'menu.snapshot', 'standard.view', 'nutrition.view', 'costing.view', 'costing.recalculate', 'inventory.view', 'document.export', 'activity.view'],
    true, true, true, 2),
  role('Restaurant Cook', 'Authors dish recipes for one branch.',
    ['dashboard.view', 'dish.view', 'dish.edit', 'recipe.history', 'menu.view', 'inventory.view', 'nutrition.view', 'production.view'],
    true, false, false, 4),
  role('Prep Cook', 'Authors production recipes for one prep kitchen.',
    ['dashboard.view', 'production.view', 'production.edit', 'recipe.history', 'inventory.view', 'nutrition.view'],
    true, false, false, 3),
]

function role(
  name: string, description: string, codes: string[],
  isSystem: boolean, allBranches: boolean, allPrep: boolean, members: number,
): Role {
  return {
    id: `role-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    description,
    is_system: isSystem,
    capability_codes: codes as Role['capability_codes'],
    grants_all_branches: allBranches,
    grants_all_prep_kitchens: allPrep,
    default_branch_ids: [],
    default_prep_kitchen_ids: [],
    member_count: members,
  }
}

export const SEED_ACCOUNT_USERS: AccountUser[] = [
  user(1, 'admin', 'Green Hills Admin', 'Administrator', true),
  user(2, 'nadia', 'Chef Nadia Haddad', 'Executive Chef'),
  user(3, 'lina', 'Lina Aoun', 'QA Manager'),
  user(4, 'omar', 'Omar Saleh', 'Cost Controller'),
  {
    ...user(5, 'salmiya.cook', 'Salmiya Line Cook', 'Restaurant Cook'),
    scope_overridden: true,
    branch_ids: [salmiya.id],
    extra_capability_codes: ['menu.snapshot'],
    effective_scope: { branches: [salmiya.id], prep_kitchens: [] },
  },
  {
    ...user(6, 'sauce.prep', 'Sauce Section Cook', 'Prep Cook'),
    scope_overridden: true,
    prep_kitchen_ids: ['pk-sauce'],
    effective_scope: { branches: [], prep_kitchens: ['pk-sauce'] },
  },
]

function user(id: number, username: string, display: string, roleName: string, superuser = false): AccountUser {
  const r = SEED_ROLES.find((x) => x.name === roleName)!
  return {
    id,
    username,
    email: `${username}@greenhills.demo`,
    is_active: true,
    is_superuser: superuser,
    profile_id: `p-${id}`,
    display_name: display,
    role_id: r.id,
    role_name: roleName,
    is_membership_active: true,
    scope_overridden: false,
    branch_ids: [],
    prep_kitchen_ids: [],
    extra_capability_codes: [],
    denied_capability_codes: [],
    effective_capabilities: superuser ? allCodes as AccountUser['effective_capabilities'] : r.capability_codes,
    effective_scope: { branches: 'all', prep_kitchens: 'all' },
  }
}
