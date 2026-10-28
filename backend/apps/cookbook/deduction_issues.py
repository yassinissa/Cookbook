"""
NOTE — POS deduction issues (inventory-platform's debug channel, read here)

inventory-platform deducts stock from each uploaded Lavu "Sales by Item"
report and records, per line, exactly what went wrong
(`POSImportLine.issues`: {code, level, item, message, fix, ...}). Most root
causes live in Cookbook — a dish's POS name, an unpublished edit, a modifier
option with no POS text or no stock effect, an item with no unit conversion.

`collect_deduction_issues()` reads the recent imports, groups every line issue
by root cause (one entry per cause, however many lines / days it hit), and
resolves each against Cookbook's own data so the entry says *where to fix it
here* — or that it's an inventory-side problem (short stock), or expected (a
modifier marked "no stock impact").

  side = cookbook   fix it in Cookbook (`target` is the screen)
         inventory  fix it in inventory-platform (stock, branch setup)
         expected   nothing to fix — Cookbook says this modifier moves no stock

Read-only: nothing here writes to inventory-platform. Re-applying a fixed
import is still inventory's "Re-apply" button (only lines that moved no stock
are retried — a modifier that was ignored stays ignored for past sales).
"""
import re
from datetime import date, timedelta

from apps.integrations.inventory_client import InventoryClient

from .models import Branch, DishRecipe

# inventory-platform's IssueCode vocabulary (apps/pos_integration/services.py)
NO_RECIPE = 'no_recipe'
RECIPE_NO_INGREDIENTS = 'recipe_no_ingredients'
UNIT_CONVERSION = 'unit_conversion_missing'
INSUFFICIENT_STOCK = 'insufficient_stock'
MODIFIER_NOT_MODELLED = 'modifier_not_modelled'
IMPORT_FAILED = 'import_failed'          # Cookbook's own: a whole import stopped

# lines inventory's Re-apply retries (they moved no stock); a modifier that was
# ignored still deducted its base, so past sales of it aren't retried
RETRYABLE = {NO_RECIPE, RECIPE_NO_INGREDIENTS, UNIT_CONVERSION, INSUFFICIENT_STOCK}

_ISSUE_STATUSES = {'partial', 'failed'}   # `completed` has no gaps
_PAGE_SIZE = 50
_MAX_PAGES = 20


def norm(s):
    """inventory's matching form: drop a leading "(X)" code, keep the English
    half of "EN / AR", collapse spaces, casefold — "(C) CHICKEN / دجاج" → "chicken"."""
    s = re.sub(r'^\s*[\(\[][^)\]]*[\)\]]\s*', '', str(s or ''))
    return ' '.join(s.split('/')[0].split()).casefold()


def _modifier_forms(mod):
    """Whole modifier first, then each part of a compound ("Medium - No Onion")."""
    whole = norm(mod)
    parts = [norm(p) for p in re.split(r'\s+-\s+|,', str(mod or '').split('/')[0]) if norm(p)]
    return [whole] + [p for p in parts if p != whole]


def _label(line):
    name = (line.get('pos_item_name') or '').split('/')[0].strip()
    mod = line.get('pos_modifier') or ''
    return name + (f' [{mod}]' if mod else '')


# ── Cookbook side: who owns each POS name ─────────────────────────────────

class _Book:
    """Cookbook's current dishes indexed the way inventory matches them —
    (brand, normalised POS name) and (brand, normalised name_en)."""

    def __init__(self):
        self.brands = {b.slug: b for b in Branch.objects.exclude(slug='')}
        self.by_pos, self.by_name = {}, {}
        dishes = (DishRecipe.objects.filter(is_current=True, branch_ref__isnull=False)
                  .select_related('branch_ref')
                  .prefetch_related('ingredients', 'modifier_groups__group__options__deltas',
                                    'modifier_groups__group__options__variant_recipe'))
        for d in dishes:
            slug = d.branch_ref.slug
            if d.pos_item_name:
                self.by_pos.setdefault((slug, norm(d.pos_item_name)), d)
            self.by_name.setdefault((slug, norm(d.name_en)), d)

    def dish(self, brand, pos_item_name):
        key = (brand, norm(pos_item_name))
        return self.by_pos.get(key) or self.by_name.get(key)

    @staticmethod
    def option(dish, pos_modifier):
        forms = _modifier_forms(pos_modifier)
        for form in forms:
            for dmg in dish.modifier_groups.all():
                for opt in dmg.group.options.all():
                    if opt.pos_mods_string and norm(opt.pos_mods_string) == form:
                        return opt
        return None


def _dish_target(d):
    return {'type': 'dish', 'id': str(d.id), 'label': d.name_en, 'path': f'/recipes/dishes/{d.id}'}


def _publish_state(d):
    if not d.inventory_recipe_id:
        return 'unpublished'
    if d.published_at and d.updated_at and d.published_at < d.updated_at:
        return 'stale'
    return 'published'


def _resolve_dish(book, brand, pos_item_name):
    """(dish | None, resolution | None) — a resolution when the dish itself is the problem."""
    if brand not in book.brands:
        return None, {
            'status': 'brand_unknown', 'side': 'inventory',
            'fix': (f'The inventory branch is set to brand "{brand}", but no Cookbook brand has that '
                    f'key. Correct the branch\'s brand in inventory-platform (it must equal a '
                    f'Cookbook brand key).'),
            'target': None,
        }
    d = book.dish(brand, pos_item_name)
    if d is None:
        b = book.brands[brand]
        return None, {
            'status': 'dish_missing', 'side': 'cookbook',
            'fix': (f'No {b.name_en} dish has the POS name "{pos_item_name.split("/")[0].strip()}". '
                    f'Set it as the POS name on the right dish (exactly as the sales report spells it), '
                    f'or create the dish, then publish.'),
            'target': {'type': 'dishes', 'id': None, 'label': b.name_en,
                       'path': '/recipes/dishes'},
        }
    state = _publish_state(d)
    if state == 'unpublished':
        return d, {'status': 'dish_unpublished', 'side': 'cookbook',
                   'fix': f'"{d.name_en}" was never published to inventory. Publish it.',
                   'target': _dish_target(d)}
    if state == 'stale':
        return d, {'status': 'dish_stale', 'side': 'cookbook',
                   'fix': f'"{d.name_en}" was edited after its last publish. Publish it again.',
                   'target': _dish_target(d)}
    return d, None


def _resolve(book, group, items_by_id):
    code, brand = group['code'], group.get('brand') or ''
    pos_item, pos_mod = group.get('pos_item_name') or '', group.get('pos_modifier') or ''

    if code == INSUFFICIENT_STOCK:
        return {'status': 'stock_short', 'side': 'inventory', 'fix': group.get('inventory_fix') or '',
                'target': None}
    if code == IMPORT_FAILED:
        return {'status': 'import_failed', 'side': 'inventory',
                'fix': 'Fix the cause above in inventory-platform, then upload the report again.',
                'target': None}

    if code == UNIT_CONVERSION:
        item = items_by_id.get(group.get('item_id') or '')
        frm, to = group.get('from_unit') or '?', group.get('to_unit') or '?'
        name = item['name_en'] if item else group.get('item') or ''
        return {
            'status': 'conversion_missing', 'side': 'cookbook',
            'fix': (f'Open {name} → Measurement conversions and say how many {frm} one {to} holds '
                    f'(e.g. 1 {to} = … {frm}). Saving syncs it to inventory.'),
            'target': {'type': 'item', 'id': item['sku'] if item else None, 'label': name,
                       'path': f'/inventory?q={item["sku"] if item else name}'},
        }

    dish, problem = _resolve_dish(book, brand, pos_item)
    if problem:
        return problem

    if code == NO_RECIPE:
        return {'status': 'published_unmatched', 'side': 'cookbook',
                'fix': (f'"{dish.name_en}" is published and its POS name matches, but inventory still '
                        f'found no recipe. Publish it again to refresh inventory\'s copy.'),
                'target': _dish_target(dish)}

    if code == RECIPE_NO_INGREDIENTS:
        if not dish.ingredients.exists():
            return {'status': 'no_ingredients', 'side': 'cookbook',
                    'fix': f'Add the ingredients to "{dish.name_en}", then publish it.',
                    'target': _dish_target(dish)}
        return {'status': 'dish_stale', 'side': 'cookbook',
                'fix': f'"{dish.name_en}" has ingredients now. Publish it again.',
                'target': _dish_target(dish)}

    if code == MODIFIER_NOT_MODELLED:
        opt = book.option(dish, pos_mod)
        if opt is None:
            return {'status': 'option_missing', 'side': 'cookbook',
                    'fix': (f'No modifier option on "{dish.name_en}" has the POS text "{pos_mod}". '
                            f'Put that exact text in the matching option\'s POS “Mods” text (or add the '
                            f'option and attach its group to the dish).'),
                    'target': {'type': 'dish_modifiers', 'id': str(dish.id), 'label': dish.name_en,
                               'path': f'/pos?tab=dishes&dish={dish.id}'}}
        group_target = {'type': 'modifier_group', 'id': str(opt.group_id), 'label': opt.group.name_en,
                        'path': f'/pos?group={opt.group_id}'}
        if opt.no_consumption_impact:
            return {'status': 'marked_no_impact', 'side': 'expected',
                    'fix': f'"{opt.name_en}" is marked "no stock impact" in Cookbook — nothing to deduct.',
                    'target': group_target}
        if opt.deduction_status == 'needs_data':
            return {'status': 'option_needs_data', 'side': 'cookbook',
                    'fix': (f'"{opt.name_en}" has no stock effect yet. Add what it uses (or removes), '
                            f'or mark it "no stock impact". Then publish "{dish.name_en}".'),
                    'target': group_target}
        return {'status': 'option_unpublished', 'side': 'cookbook',
                'fix': (f'"{opt.name_en}" has its stock effect in Cookbook, but "{dish.name_en}" hasn\'t '
                        f'been published since. Publish it again.'),
                'target': _dish_target(dish)}

    return {'status': 'unknown', 'side': 'inventory', 'fix': group.get('inventory_fix') or '',
            'target': None}


# ── inventory side: read the recent imports ───────────────────────────────

def _recent_imports(client, since):
    out = []
    for page in range(1, _MAX_PAGES + 1):
        data = client.get_pos_reports({'page': page, 'page_size': _PAGE_SIZE})
        rows = data.get('results', []) if isinstance(data, dict) else data
        for r in rows:
            if (r.get('import_date') or '') < since.isoformat():
                return out
            out.append(r)
        if not isinstance(data, dict) or not data.get('next'):
            break
    return out


def _key(code, issue, line, brand, branch_id):
    if code == UNIT_CONVERSION:
        return (code, issue.get('item_id'), issue.get('from_unit'), issue.get('to_unit'))
    if code == INSUFFICIENT_STOCK:
        return (code, issue.get('item_id'), branch_id)
    return (code, brand, norm(line.get('pos_item_name')),
            norm(line.get('pos_modifier')) if code == MODIFIER_NOT_MODELLED else '')


def collect_deduction_issues(*, days=14, brands=None, client=None, items_by_sku=None):
    """Every distinct deduction problem in the last `days` of POS imports.
    `brands` (a set of Branch.slug) limits it to those brands; None = all."""
    client = client or InventoryClient()
    since = date.today() - timedelta(days=days)
    branches = {str(b['id']): b for b in client.get_branches()}
    imports = _recent_imports(client, since)
    items_by_id = {str(i.get('id')): i for i in (items_by_sku or {}).values() if i.get('id')}

    groups, scanned, with_issues = {}, 0, 0
    for imp in imports:
        if imp.get('status') == 'reverted':
            continue
        branch = branches.get(str(imp.get('branch')), {})
        brand = (branch.get('brand') or '').strip().lower()
        if brands is not None and brand not in brands:
            continue
        scanned += 1
        if imp.get('status') not in _ISSUE_STATUSES:
            continue
        detail = client.get_pos_report(imp['id'])
        day, branch_name = imp.get('import_date'), imp.get('branch_name') or branch.get('name_en', '')
        found = False

        for line in detail.get('lines') or []:
            for issue in line.get('issues') or []:
                found = True
                code = issue.get('code') or 'unknown'
                key = _key(code, issue, line, brand, str(imp.get('branch')))
                g = groups.get(key)
                if g is None:
                    g = groups[key] = {
                        'code': code, 'level': issue.get('level', 'error'), 'brand': brand,
                        'item': issue.get('item'), 'item_id': issue.get('item_id'),
                        'from_unit': issue.get('from_unit'), 'to_unit': issue.get('to_unit'),
                        'pos_item_name': (line.get('pos_item_name') or '').split('/')[0].strip(),
                        'pos_modifier': line.get('pos_modifier') if code == MODIFIER_NOT_MODELLED else '',
                        'message': issue.get('message', ''), 'inventory_fix': issue.get('fix', ''),
                        'retryable': code in RETRYABLE,
                        'branches': set(), 'lines': set(), 'imports': [],
                        'occurrences': 0, 'qty_sold': 0.0,
                        'first_date': day, 'last_date': day,
                    }
                g['branches'].add(branch_name)
                g['lines'].add(_label(line))
                g['occurrences'] += 1
                g['qty_sold'] += float(line.get('quantity_sold') or 0)
                if day and day < g['first_date']:
                    g['first_date'] = day
                if day and day > g['last_date']:
                    g['last_date'], g['message'] = day, issue.get('message', g['message'])
                ref = {'id': imp['id'], 'date': day, 'branch': branch_name}
                if ref not in g['imports']:
                    g['imports'].append(ref)

        if not found and imp.get('status') == 'failed' and detail.get('error_log'):
            found = True
            g = groups.setdefault((IMPORT_FAILED, imp['id']), {
                'code': IMPORT_FAILED, 'level': 'error', 'brand': brand, 'item': branch_name,
                'item_id': None, 'from_unit': None, 'to_unit': None,
                'pos_item_name': '', 'pos_modifier': '',
                'message': detail['error_log'].splitlines()[0], 'inventory_fix': '',
                'retryable': False, 'branches': {branch_name}, 'lines': set(),
                'imports': [{'id': imp['id'], 'date': day, 'branch': branch_name}],
                'occurrences': 1, 'qty_sold': 0.0, 'first_date': day, 'last_date': day,
            })
        with_issues += int(found)

    book = _Book()
    out = []
    for g in groups.values():
        g.update(_resolve(book, g, items_by_id))
        g['branches'] = sorted(b for b in g['branches'] if b)
        g['lines'] = sorted(g['lines'])
        g['qty_sold'] = round(g['qty_sold'], 3)
        g['imports'].sort(key=lambda r: r['date'] or '', reverse=True)
        out.append(g)

    side_order = {'cookbook': 0, 'inventory': 1, 'expected': 2}
    out.sort(key=lambda g: (side_order.get(g['side'], 3), 0 if g['level'] == 'error' else 1,
                            -(g['occurrences']), g['pos_item_name'] or g['item'] or ''))
    summary = {s: sum(1 for g in out if g['side'] == s) for s in side_order}
    return {
        'days': days, 'since': since.isoformat(),
        'imports_scanned': scanned, 'imports_with_issues': with_issues,
        'summary': summary, 'issues': out,
    }
