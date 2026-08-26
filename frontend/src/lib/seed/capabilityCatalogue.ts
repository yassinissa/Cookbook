/* Mirrors backend apps/accounts/capabilities.py CAPABILITIES (code, label, group). */
import type { CapabilityCode } from '@/types/access'

export const CAPABILITIES: { code: CapabilityCode; label: string; group: string }[] = [
  { code: 'dashboard.view', label: 'View the dashboard', group: 'Dashboard' },
  { code: 'dish.view', label: 'View dish recipes', group: 'Dish recipes' },
  { code: 'dish.edit', label: 'Create & edit dish recipes', group: 'Dish recipes' },
  { code: 'dish.delete', label: 'Delete dish recipes', group: 'Dish recipes' },
  { code: 'recipe.history', label: 'View version history & diffs', group: 'Dish recipes' },
  { code: 'production.view', label: 'View production recipes', group: 'Production recipes' },
  { code: 'production.edit', label: 'Create & edit production recipes', group: 'Production recipes' },
  { code: 'production.delete', label: 'Delete production recipes', group: 'Production recipes' },
  { code: 'menu.view', label: 'View branch menus', group: 'Menus' },
  { code: 'menu.edit', label: 'Edit menu lines & build menus', group: 'Menus' },
  { code: 'menu.snapshot', label: 'Take menu cost snapshots', group: 'Menus' },
  { code: 'standard.view', label: 'View QA / QC dish standards', group: 'QA standards' },
  { code: 'standard.edit', label: 'Create & edit QA / QC standards', group: 'QA standards' },
  { code: 'costing.view', label: 'See cost, price & margin figures', group: 'Costing' },
  { code: 'costing.recalculate', label: 'Recalculate recipe cost', group: 'Costing' },
  { code: 'inventory.view', label: 'Browse inventory items', group: 'Inventory' },
  { code: 'nutrition.view', label: 'View nutrition & allergen roll-ups', group: 'Nutrition' },
  { code: 'document.export', label: 'Export / print recipe documents', group: 'Documents' },
  { code: 'pos.manage', label: 'Manage POS modifiers & cross-check', group: 'POS' },
  { code: 'activity.view', label: 'View the company change log', group: 'Activity' },
  { code: 'admin.users', label: 'Manage users & assignments', group: 'Administration' },
  { code: 'admin.roles', label: 'Manage roles & capabilities', group: 'Administration' },
]
