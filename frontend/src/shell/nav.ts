import type { IconName } from '@/components/Icon'
import type { MessageKey } from '@/i18n/messages'
import type { CapabilityCode } from '@/types/access'

export interface NavItem {
  to: string
  labelKey: MessageKey
  icon: IconName
  /** false → routes to the "next release" placeholder */
  ready: boolean
  /** hidden unless the user has this capability (or is superuser) */
  capability?: CapabilityCode
}

export interface NavSection {
  labelKey: MessageKey
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    labelKey: 'nav.section.recipes',
    items: [
      { to: '/', labelKey: 'nav.dashboard', icon: 'dashboard', ready: true, capability: 'dashboard.view' },
      { to: '/recipes/dishes', labelKey: 'nav.dishes', icon: 'dish', ready: true, capability: 'dish.view' },
      { to: '/recipes/production', labelKey: 'nav.production', icon: 'production', ready: false, capability: 'production.view' },
      { to: '/standards', labelKey: 'nav.standards', icon: 'standards', ready: false, capability: 'standard.view' },
    ],
  },
  {
    labelKey: 'nav.section.operations',
    items: [
      { to: '/menus', labelKey: 'nav.menus', icon: 'menu', ready: true, capability: 'menu.view' },
      { to: '/inventory', labelKey: 'nav.inventory', icon: 'inventory', ready: true, capability: 'inventory.view' },
      { to: '/activity', labelKey: 'nav.activity', icon: 'activity', ready: false, capability: 'activity.view' },
      { to: '/documents', labelKey: 'nav.documents', icon: 'documents', ready: false, capability: 'document.export' },
      { to: '/pos', labelKey: 'nav.pos', icon: 'pos', ready: false, capability: 'pos.manage' },
    ],
  },
  {
    labelKey: 'nav.section.admin',
    items: [
      { to: '/admin/users', labelKey: 'nav.users', icon: 'users', ready: true, capability: 'admin.users' },
      { to: '/admin/roles', labelKey: 'nav.roles', icon: 'shield', ready: true, capability: 'admin.roles' },
    ],
  },
]

/**
 * Flat list for the mobile bottom bar — four primary destinations plus a
 * "More" tab that opens the full nav (`/more`). The bar is the only nav on
 * screens below `lg`, where the Sidebar is hidden, so everything in NAV that
 * isn't here has to stay reachable through More.
 */
export const BOTTOM_NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: 'dashboard', ready: true, capability: 'dashboard.view' },
  { to: '/recipes/dishes', labelKey: 'nav.dishes', icon: 'dish', ready: true, capability: 'dish.view' },
  { to: '/menus', labelKey: 'nav.menus', icon: 'menu', ready: true, capability: 'menu.view' },
  { to: '/recipes/production', labelKey: 'nav.production', icon: 'production', ready: false, capability: 'production.view' },
  { to: '/more', labelKey: 'nav.more', icon: 'more', ready: true },
]
