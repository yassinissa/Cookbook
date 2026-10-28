/**
 * "Customer picks" — mirrors `apps/cookbook/modifier_rules.py` so the group
 * editor can warn while options are being edited (the saved group carries the
 * server's `pick_rule` / `suggested_rule` / `rule_issues`). Change both together.
 */
import type {
  ModifierFamily, ModifierOptionKind, ModifierRuleIssue, ModifierSelection, PickRule,
} from '@/types/api'
import type { TFunc } from '@/i18n'

export const PICK_RULES: PickRule[] = ['exactly', 'optional_one', 'up_to', 'any', 'range']

const FAMILY: Record<ModifierOptionKind, ModifierFamily> = {
  choice: 'pick', type: 'pick', addon: 'extra', instruction: 'instruction',
}

/** how a menu reads them: the choice first, then extras, then changes */
const FAMILY_ORDER: ModifierFamily[] = ['pick', 'extra', 'instruction']

export function pickRule(min: number, max: number | null): PickRule {
  if (max == null) return min === 0 ? 'any' : 'range'
  if (min === max && max >= 1) return 'exactly'
  if (min === 0) return max === 1 ? 'optional_one' : 'up_to'
  return 'range'
}

export function selectionFor(max: number | null): ModifierSelection {
  return max === 1 ? 'single' : 'multi'
}

/** min/max a preset means, given the count the editor shows next to it. */
export function boundsFor(rule: PickRule, n: number, range: { min: number; max: number | null }) {
  switch (rule) {
    case 'exactly': return { min: n, max: n }
    case 'optional_one': return { min: 0, max: 1 }
    case 'up_to': return { min: 0, max: n }
    case 'any': return { min: 0, max: null }
    case 'range': return range
  }
}

export function suggestedRule(kinds: ModifierOptionKind[]) {
  const families = new Set(kinds.map((k) => FAMILY[k]))
  if (families.size === 0) return null
  if (families.size === 1 && families.has('pick'))
    return { rule: 'exactly' as PickRule, min_select: 1, max_select: 1 }
  return { rule: 'any' as PickRule, min_select: 0, max_select: null }
}

export function ruleIssues(min: number, max: number | null, kinds: ModifierOptionKind[]): ModifierRuleIssue[] {
  const issues: ModifierRuleIssue[] = []
  const present = new Set(kinds.map((k) => FAMILY[k]))
  const families = FAMILY_ORDER.filter((f) => present.has(f))
  if (max === 1 && families.length > 1) issues.push({ code: 'mixed_single_pick', families })
  if (kinds.length && min > kinds.length)
    issues.push({ code: 'min_over_options', min_select: min, options: kinds.length })
  return issues
}

/** "Exactly 1" / "Up to 3" / "Any number" — the one-line reading of a rule. */
export function ruleSummary(min: number, max: number | null, t: TFunc) {
  const r = pickRule(min, max)
  if (r === 'range')
    return max == null ? t('mods.rule.sum.atLeast', { n: min }) : t('mods.rule.sum.range', { min, max })
  return t(`mods.rule.sum.${r}`, { n: r === 'exactly' ? min : max ?? 0 })
}

export function issueText(iss: ModifierRuleIssue, t: TFunc) {
  if (iss.code === 'mixed_single_pick')
    return t('mods.issue.mixed', { families: iss.families.map((f) => t(`mods.family.${f}`)).join(' + ') })
  return t('mods.issue.minOver', { min: iss.min_select, n: iss.options })
}
