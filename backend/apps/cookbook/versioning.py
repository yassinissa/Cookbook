"""
Recipe versioning.

The row a caller holds (stable pk) is always the *current* version. Editing the
ingredients or their quantities, the method steps, the yield, the name /
description, the menu category or the selling price first archives a read-only
snapshot of the pre-edit state as a new row with is_current=False, then bumps
the live row's version and gives it the next version code (`version_code`,
stored in `revision`: Rev.01, Rev.02 ...). Any other edit (station, prep time,
waste %, notes, approvals, a cost recalculation ...) is an *adjustment*:
recorded in the change log with the same before/after detail, but the version
and its code stay put. Old snapshots keep their own ingredient/step
copies so a past recipe can always be reproduced exactly (the source cook book
kept these on a "History" sheet by hand).

Cost/price history rows and the activity log stay attached to the live pk.
"""
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher

# Scalar fields whose change means "this is a new revision of the recipe",
# on top of the ingredient lines and method steps compared below: the item
# name and description, its menu category, its selling price, and the yield.
# Cost is deliberately absent — it moves with supplier prices, not with the
# recipe.
_VERSIONED_FIELDS = {
    'name_en', 'name_ar', 'taste_profile', 'category', 'selling_price',
    'output_item_sku', 'output_qty', 'output_unit',
}


def version_code(version):
    """The code the system gives each version: Rev.01, Rev.02 ..."""
    return f'Rev.{version or 1:02d}'


def _field_names(model):
    return {f.name for f in model._meta.concrete_fields}


def _num(v):
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError):
        return v


def _ingredient_key(obj):
    if isinstance(obj, dict):
        return (str(obj.get('item_sku') or ''), _num(obj.get('quantity')),
                str(obj.get('unit') or ''), str(obj.get('prep_note') or ''),
                str(obj.get('alt_item_sku') or ''))
    return (obj.item_sku, _num(obj.quantity), str(obj.unit_id or ''), obj.prep_note or '',
            getattr(obj, 'alt_item_sku', '') or '')


def _step_key(obj):
    return obj.get('instruction', '') if isinstance(obj, dict) else obj.instruction


def _lines_differ(current_manager, incoming, key, *, ordered):
    if incoming is None:
        return False
    a, b = [key(x) for x in current_manager.all()], [key(x) for x in incoming]
    if ordered:
        return a != b
    # the same lines in a different order is not a new recipe
    return sorted(a, key=repr) != sorted(b, key=repr)


def edit_is_a_new_version(instance, validated_data, ingredient_data, step_data):
    if _lines_differ(instance.ingredients, ingredient_data, _ingredient_key, ordered=False):
        return True
    if _lines_differ(instance.steps, step_data, _step_key, ordered=True):
        return True
    for attr, new_value in validated_data.items():
        if attr not in _VERSIONED_FIELDS:
            continue
        # a related object compares by its pk; 2.9 and 2.900 are the same price
        current = getattr(instance, attr, None)
        current, new_value = getattr(current, 'pk', current), getattr(new_value, 'pk', new_value)
        if _num(current) != _num(new_value) and str(current or '') != str(new_value or ''):
            return True
    return False


# ── recipe state + diff (the change log and the version diff share this) ───

# Every scalar/display field worth recording, in display order. Missing ones
# (dish-only vs production-only) are simply skipped.
_STATE_FIELDS = [
    'name_en', 'name_ar', 'recipe_code', 'revision', 'revision_date',
    'branch_ref', 'prep_kitchen_ref', 'prep_kitchen', 'category', 'section', 'service_style',
    'output_item_sku', 'output_qty', 'output_unit',
    'prep_time_minutes', 'expected_waste_pct', 'include_labor_cost',
    'selling_price', 'cost', 'labor_cost',
    'rating', 'rating_status', 'rating_date',
    'taste_profile', 'pos_item_name', 'notes',
    'approved_by', 'qa_approved_by', 'approved_at', 'image',
]

# Stripped from a change record for callers without `costing.view`.
COSTING_FIELDS = {'selling_price', 'cost', 'labor_cost'}


def _fk_label(obj):
    for attr in ('name_en', 'name', 'code'):
        label = getattr(obj, attr, None)
        if label:
            return str(label)
    return str(obj)


def _field_state(recipe, name):
    """[comparable, display] for one field (JSON-safe)."""
    value = getattr(recipe, name)
    if name == 'image':
        key = (value.name if value else '') or None
        return [key, 'photo' if key else None]
    if hasattr(value, 'pk'):
        return [str(value.pk), _fk_label(value)]
    if value is None or value == '':
        return [None, None]
    if isinstance(value, bool):
        return [value, 'Yes' if value else 'No']
    if isinstance(value, (int, float, Decimal)):
        # 2.9 and 2.900 are the same number
        return [format(Decimal(str(value)).normalize(), 'f'), str(value)]
    return [str(value), str(value)]


def _ingredient_summary(obj):
    return {
        'item_sku': obj.item_sku,
        'item_name_snapshot': obj.item_name_snapshot,
        'prep_note': obj.prep_note,
        'quantity': str(obj.quantity),
        'unit': obj.unit.code if obj.unit_id else None,
        'alt_item_sku': getattr(obj, 'alt_item_sku', '') or '',
        'alt_item_name_snapshot': getattr(obj, 'alt_item_name_snapshot', '') or '',
    }


EMPTY_STATE = {'fields': {}, 'ingredients': [], 'steps': [], 'allergens': []}


def recipe_state(recipe):
    """A plain snapshot of everything the change log tracks about a recipe.
    Reads the lines straight from the DB — a prefetch cache on `recipe` would
    be stale mid-save."""
    names = {f.name for f in recipe._meta.get_fields()}
    ingredients = recipe.ingredients.model.objects.filter(recipe_id=recipe.pk).select_related('unit')
    steps = recipe.steps.model.objects.filter(recipe_id=recipe.pk)
    allergens = []
    if 'allergens' in names:
        allergens = sorted(recipe._meta.get_field('allergens').related_model.objects
                           .filter(dishes=recipe.pk).values_list('name', flat=True))
    return {
        'fields': {n: _field_state(recipe, n) for n in _STATE_FIELDS if n in names},
        'ingredients': [_ingredient_summary(i) for i in ingredients],
        'steps': [s.instruction for s in steps],
        'allergens': allergens,
    }


_LINE_FIELDS = ('quantity', 'unit', 'prep_note', 'item_name_snapshot', 'alt_item_sku')


def _by_sku(lines):
    """{(sku, nth occurrence): line} — a SKU can appear on two lines."""
    seen, out = {}, {}
    for line in lines:
        n = seen.get(line['item_sku'], 0)
        seen[line['item_sku']] = n + 1
        out[(line['item_sku'], n)] = line
    return out


def _line_differs(a, b, field):
    if field == 'quantity':
        return _num(a.get(field)) != _num(b.get(field))
    return (a.get(field) or '') != (b.get(field) or '')


def diff_states(before, after):
    """Structured field / ingredient / step / allergen diff between two
    `recipe_state()` snapshots."""
    fields = []
    for name in _STATE_FIELDS:
        if name not in before['fields'] and name not in after['fields']:
            continue
        a_key, a = before['fields'].get(name, (None, None))
        b_key, b = after['fields'].get(name, (None, None))
        if a_key != b_key:
            fields.append({'field': name, 'from': a, 'to': b})

    old, new = _by_sku(before['ingredients']), _by_sku(after['ingredients'])
    changed = []
    for key in old:
        if key not in new:
            continue
        which = [f for f in _LINE_FIELDS if _line_differs(old[key], new[key], f)]
        if which:
            changed.append({'label': key[0], 'from': old[key], 'to': new[key], 'changed': which})
    reordered = old.keys() == new.keys() and (
        [l['item_sku'] for l in before['ingredients']] != [l['item_sku'] for l in after['ingredients']])

    s_added, s_removed, s_changed = [], [], []
    a_steps, b_steps = before['steps'], after['steps']
    for op, i1, i2, j1, j2 in SequenceMatcher(None, a_steps, b_steps, autojunk=False).get_opcodes():
        if op == 'equal':
            continue
        # a reworded step pairs with the one it replaced; any surplus on
        # either side is a plain add / remove
        paired = min(i2 - i1, j2 - j1) if op == 'replace' else 0
        s_changed += [{'n': j1 + k + 1, 'from': a_steps[i1 + k], 'to': b_steps[j1 + k]}
                      for k in range(paired)]
        s_removed += a_steps[i1 + paired:i2]
        s_added += b_steps[j1 + paired:j2]

    return {
        'fields': fields,
        'ingredients': {
            'added': [new[k] for k in new if k not in old],
            'removed': [old[k] for k in old if k not in new],
            'changed': changed,
            'reordered': reordered,
        },
        'steps': {
            'added': s_added, 'removed': s_removed, 'changed': s_changed,
            'count_from': len(a_steps), 'count_to': len(b_steps),
        },
        'allergens': {
            'added': [a for a in after['allergens'] if a not in before['allergens']],
            'removed': [a for a in before['allergens'] if a not in after['allergens']],
        },
    }


def has_changes(diff):
    if not diff:
        return False
    ing, steps, alg = diff.get('ingredients', {}), diff.get('steps', {}), diff.get('allergens', {})
    return bool(
        diff.get('fields') or ing.get('added') or ing.get('removed') or ing.get('changed')
        or ing.get('reordered') or steps.get('added') or steps.get('removed') or steps.get('changed')
        or alg.get('added') or alg.get('removed')
    )


def strip_costing(diff):
    """The same diff without money fields — for callers lacking `costing.view`."""
    if not diff:
        return diff
    return {**diff, 'fields': [f for f in diff.get('fields', []) if f['field'] not in COSTING_FIELDS]}


def model_values(obj, skip=()):
    """{field: display} for a side record hanging off a recipe (QA standard,
    plating guide). `None` (no record yet) is an empty dict."""
    if obj is None:
        return {}
    out = {}
    for f in obj._meta.concrete_fields:
        if f.name in ('id', 'created_at', 'updated_at', 'dish_recipe') or f.name in skip:
            continue
        value = getattr(obj, f.name)
        if hasattr(value, 'pk'):
            out[f.name] = _fk_label(value)
        elif value is None or value == '' or value == [] or value == {}:
            out[f.name] = None
        elif isinstance(value, Decimal):
            out[f.name] = format(value.normalize(), 'f')
        else:
            out[f.name] = str(value)
    return out


def side_record_changes(prefix, before, after):
    """A change record for a side record: the same `fields` rows a recipe
    diff has, named `<prefix>.<field>`."""
    rows = [
        {'field': f'{prefix}.{name}', 'from': before.get(name), 'to': after.get(name)}
        for name in {**before, **after}
        if before.get(name) != after.get(name)
    ]
    return {'fields': rows} if rows else {}


def diff_recipes(older, newer):
    """Diff between two recipe rows (either order works; `older`→`newer` is
    just the labelling)."""
    return diff_states(recipe_state(older), recipe_state(newer))


def summarize(diff):
    """Counts, for a timeline row."""
    diff = diff or {}
    ing, steps = diff.get('ingredients', {}), diff.get('steps', {})
    return {
        'fields_changed': [f['field'] for f in diff.get('fields', [])],
        'ingredients_added': len(ing.get('added', [])),
        'ingredients_removed': len(ing.get('removed', [])),
        'ingredients_changed': len(ing.get('changed', [])),
        'steps_added': len(steps.get('added', [])),
        'steps_removed': len(steps.get('removed', [])),
        'steps_changed': len(steps.get('changed', [])),
    }


def diff_summary(older, newer):
    return summarize(diff_recipes(older, newer))


def archive_current_version(instance):
    """
    Copy `instance` (as it is *now*, before the pending edit is applied) into a
    new is_current=False row, along with its ingredient and step lines.
    Returns the archived copy. Does not touch `instance`.
    """
    model = type(instance)
    copy_fields = _field_names(model) - {'id', 'created_at', 'updated_at'}
    snapshot = model(**{f: getattr(instance, f) for f in copy_fields})
    snapshot.is_current = False
    snapshot.save()

    for rel in ('ingredients', 'steps'):
        manager = getattr(instance, rel, None)
        if manager is None:
            continue
        line_model = manager.model
        line_fields = _field_names(line_model) - {'id', 'created_at', 'updated_at', 'recipe'}
        for line in manager.all():
            line_model.objects.create(
                recipe=snapshot,
                **{f: getattr(line, f) for f in line_fields},
            )

    for m2m in model._meta.many_to_many:
        getattr(snapshot, m2m.name).set(getattr(instance, m2m.name).all())

    return snapshot
