/* Shapes from /api/auth/me/ and /api/accounts/. */

export type CapabilityCode =
  | 'dashboard.view'
  | 'dish.view' | 'dish.edit' | 'dish.delete' | 'recipe.history'
  | 'production.view' | 'production.edit' | 'production.delete'
  | 'menu.view' | 'menu.edit' | 'menu.snapshot'
  | 'standard.view' | 'standard.edit'
  | 'costing.view' | 'costing.recalculate'
  | 'inventory.view' | 'nutrition.view'
  | 'document.export' | 'pos.manage' | 'activity.view'
  | 'admin.users' | 'admin.roles'

export interface ScopeEntry {
  id: string
  name_en: string
  name_ar: string
}

export interface Scope {
  branches: ScopeEntry[] | 'all'
  prep_kitchens: ScopeEntry[] | 'all'
}

export interface Me {
  id: number
  username: string
  email: string
  display_name: string
  is_superuser: boolean
  is_staff: boolean
  role: { id: string; name: string } | null
  capabilities: CapabilityCode[]
  scope: Scope
}

export interface Capability {
  id: string
  code: CapabilityCode
  label: string
  group: string
  description: string
}
export interface CapabilityGroup {
  group: string
  capabilities: Capability[]
}

export interface Role {
  id: string
  name: string
  description: string
  is_system: boolean
  capability_codes: CapabilityCode[]
  grants_all_branches: boolean
  grants_all_prep_kitchens: boolean
  default_branch_ids: string[]
  default_prep_kitchen_ids: string[]
  member_count: number
}

export interface AccountUser {
  id: number
  username: string
  email: string
  is_active: boolean
  is_superuser: boolean
  profile_id: string
  display_name: string
  role_id: string | null
  role_name: string | null
  is_membership_active: boolean
  scope_overridden: boolean
  branch_ids: string[]
  prep_kitchen_ids: string[]
  extra_capability_codes: CapabilityCode[]
  denied_capability_codes: CapabilityCode[]
  effective_capabilities: CapabilityCode[]
  effective_scope: { branches: string[] | 'all'; prep_kitchens: string[] | 'all' }
}
