"""
NOTE — modifier pick rules ("Customer picks")

A ModifierGroup's selection / min_select / max_select describe what Lavu
already enforces at the till; Cookbook never pushes them anywhere (publish
sends options only) — they feed the public menu's "Choose one" / "Add" line.
So the job here is to keep them *honest*, not to enforce anything:

  `pick_rule(group)`      the one-word preset the editor shows
  `suggested_rule(kinds)` what the option kinds imply, for a new group or a
                          "use suggested" nudge — never applied silently
  `rule_issues(group)`    rules that can't be right for the options in it

The limit counts across the whole group, whatever each option's kind. A "pick
exactly one" group that mixes a protein choice with add-ons and instructions
lets the customer have the chicken OR extra cheese OR no onion — never all
three. That's `mixed_single_pick`: one question per group.

`features/pos/modifierRules.ts` mirrors this for the editor's live feedback
(same split as `brand_options` / `brandOptions.ts`) — change both together.
"""
from .models import ModifierOptionKind, ModifierSelection

# The three questions a modifier group can ask. Choice and type ("which
# protein?") are one question; add-ons ("what extras?") and instructions
# ("anything to change?") are each another.
_FAMILY = {
    ModifierOptionKind.CHOICE: 'pick',
    ModifierOptionKind.TYPE: 'pick',
    ModifierOptionKind.ADDON: 'extra',
    ModifierOptionKind.INSTRUCTION: 'instruction',
}

_FAMILY_ORDER = ('pick', 'extra', 'instruction')   # how a menu reads them

PRESETS = ('exactly', 'optional_one', 'up_to', 'any', 'range')


def pick_rule(min_select, max_select):
    """The editor preset for a stored min/max."""
    lo, hi = min_select or 0, max_select
    if hi is None:
        return 'any' if lo == 0 else 'range'
    if lo == hi and hi >= 1:
        return 'exactly'
    if lo == 0:
        return 'optional_one' if hi == 1 else 'up_to'
    return 'range'


def selection_for(max_select):
    """Single iff at most one option can be picked — derived, never chosen."""
    return ModifierSelection.SINGLE if max_select == 1 else ModifierSelection.MULTI


def suggested_rule(kinds):
    """{rule, min_select, max_select} the option kinds imply, or None with no options."""
    families = {_FAMILY.get(k, 'pick') for k in kinds}
    if not families:
        return None
    if families == {'pick'}:
        return {'rule': 'exactly', 'min_select': 1, 'max_select': 1}
    return {'rule': 'any', 'min_select': 0, 'max_select': None}


def rule_issues(min_select, max_select, kinds):
    """[{code, families?, ...}] — empty when the rule fits the options.
    `kinds` are the kinds of the group's *available* options."""
    issues = []
    present = {_FAMILY.get(k, 'pick') for k in kinds}
    families = [f for f in _FAMILY_ORDER if f in present]
    if max_select == 1 and len(families) > 1:
        issues.append({'code': 'mixed_single_pick', 'families': families})
    if kinds and (min_select or 0) > len(kinds):
        issues.append({'code': 'min_over_options', 'min_select': min_select, 'options': len(kinds)})
    return issues


def group_rule_issues(group):
    kinds = [o.kind for o in group.options.all() if o.is_available]
    return rule_issues(group.min_select, group.max_select, kinds)
