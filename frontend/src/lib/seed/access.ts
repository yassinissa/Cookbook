/*
 * Seed identities for the hermetic demo. The identity switcher (TopBar, seed
 * builds only) flips between these so a walkthrough can show the nav and data
 * shrink for a scoped user.
 */
import type { CapabilityCode, Me } from '@/types/access'
import { BRANCHES } from './catalog'

const ALL: CapabilityCode[] = [
  'dashboard.view', 'dish.view', 'dish.edit', 'dish.delete', 'recipe.history',
  'production.view', 'production.edit', 'production.delete',
  'menu.view', 'menu.edit', 'menu.snapshot', 'standard.view', 'standard.edit',
  'costing.view', 'costing.recalculate', 'inventory.view', 'nutrition.view',
  'document.export', 'pos.manage', 'activity.view', 'admin.users', 'admin.roles',
]

const salmiya = BRANCHES.find((b) => b.id === 'br-salmiya')!

export interface SeedIdentity {
  key: string
  label: string
  me: Me
}

function me(partial: Partial<Me> & Pick<Me, 'username' | 'display_name' | 'capabilities'>): Me {
  return {
    id: 1,
    email: `${partial.username}@greenhills.demo`,
    is_superuser: false,
    is_staff: false,
    role: null,
    scope: { branches: 'all', prep_kitchens: 'all' },
    ...partial,
  }
}

export const SEED_IDENTITIES: SeedIdentity[] = [
  {
    key: 'admin',
    label: 'Administrator',
    me: me({
      username: 'admin', display_name: 'Green Hills Admin', is_superuser: true,
      role: { id: 'r-admin', name: 'Administrator' }, capabilities: ALL,
    }),
  },
  {
    key: 'chef',
    label: 'Executive Chef',
    me: me({
      username: 'nadia', display_name: 'Chef Nadia Haddad',
      role: { id: 'r-chef', name: 'Executive Chef' },
      capabilities: ALL.filter((c) => !c.startsWith('admin.')),
    }),
  },
  {
    key: 'qa',
    label: 'QA Manager',
    me: me({
      username: 'lina', display_name: 'Lina Aoun',
      role: { id: 'r-qa', name: 'QA Manager' },
      capabilities: [
        'dashboard.view', 'dish.view', 'recipe.history', 'production.view',
        'menu.view', 'standard.view', 'standard.edit', 'nutrition.view',
        'inventory.view', 'activity.view',
      ],
    }),
  },
  {
    key: 'cost',
    label: 'Cost Controller',
    me: me({
      username: 'omar', display_name: 'Omar Saleh',
      role: { id: 'r-cost', name: 'Cost Controller' },
      capabilities: [
        'dashboard.view', 'dish.view', 'recipe.history', 'production.view',
        'menu.view', 'menu.snapshot', 'standard.view', 'nutrition.view',
        'costing.view', 'costing.recalculate', 'inventory.view', 'document.export',
        'activity.view',
      ],
    }),
  },
  {
    key: 'cook-salmiya',
    label: 'Restaurant Cook · Salmiya',
    me: me({
      username: 'salmiya.cook', display_name: 'Salmiya Line Cook',
      role: { id: 'r-cook', name: 'Restaurant Cook' },
      capabilities: [
        'dashboard.view', 'dish.view', 'dish.edit', 'recipe.history',
        'menu.view', 'inventory.view', 'nutrition.view', 'production.view',
      ],
      scope: {
        branches: [{ id: salmiya.id, name_en: salmiya.name_en, name_ar: salmiya.name_ar }],
        prep_kitchens: [],
      },
    }),
  },
  {
    key: 'prep-sauce',
    label: 'Prep Cook · Sauce',
    me: me({
      username: 'sauce.prep', display_name: 'Sauce Section Cook',
      role: { id: 'r-prep', name: 'Prep Cook' },
      capabilities: [
        'dashboard.view', 'production.view', 'production.edit', 'recipe.history',
        'inventory.view', 'nutrition.view',
      ],
      scope: {
        branches: [],
        prep_kitchens: [{ id: 'pk-sauce', name_en: 'Sauce', name_ar: 'الصلصات' }],
      },
    }),
  },
]

const KEY = 'cookbook.seed.identity'

export function seedIdentity(): SeedIdentity {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(KEY)
  } catch {
    /* private mode */
  }
  return SEED_IDENTITIES.find((i) => i.key === stored) ?? SEED_IDENTITIES[0]
}

export function setSeedIdentity(key: string) {
  try {
    localStorage.setItem(KEY, key)
  } catch {
    /* private mode */
  }
}
