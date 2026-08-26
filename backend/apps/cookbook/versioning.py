"""
Recipe versioning.

The row a caller holds (stable pk) is always the *current* version. Editing the
ingredients, steps or any costing input first archives a read-only snapshot of
the pre-edit state as a new row with is_current=False, then bumps the live
row's version. Old snapshots keep their own ingredient/step copies so a past
recipe can always be reproduced exactly (the source cook book kept these on a
"History" sheet by hand).

Cost/price history rows and the activity log stay attached to the live pk.
"""
from decimal import Decimal, InvalidOperation

# fields whose change means "this is a new revision of the recipe"
_VERSIONED_FIELDS = {
    'name_en', 'name_ar', 'section_id', 'prep_time_minutes', 'expected_waste_pct',
    'include_labor_cost', 'selling_price', 'output_item_sku', 'output_qty', 'output_unit_id',
}


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
                str(obj.get('unit') or ''), str(obj.get('prep_note') or ''))
    return (obj.item_sku, _num(obj.quantity), str(obj.unit_id or ''), obj.prep_note or '')


def _step_key(obj):
    return obj.get('instruction', '') if isinstance(obj, dict) else obj.instruction


def _lines_differ(current_manager, incoming, key):
    if incoming is None:
        return False
    return [key(x) for x in current_manager.all()] != [key(x) for x in incoming]


def edit_is_a_new_version(instance, validated_data, ingredient_data, step_data):
    if _lines_differ(instance.ingredients, ingredient_data, _ingredient_key):
        return True
    if _lines_differ(instance.steps, step_data, _step_key):
        return True
    field_names = _field_names(type(instance))
    for attr, new_value in validated_data.items():
        key = attr if attr in field_names else f'{attr}_id'
        if key not in _VERSIONED_FIELDS:
            continue
        current = getattr(instance, key, None)
        if key.endswith('_id') and new_value is not None:
            new_value = getattr(new_value, 'pk', new_value)
        if str(current) != str(new_value):
            return True
    return False


# ── version history + diff (read-only, for the API) ────────────────────────

# scalar/display fields worth showing in a version diff, in display order.
# FK fields are compared by their str(); missing ones are simply skipped.
_DIFF_FIELDS = [
    'name_en', 'name_ar', 'recipe_code', 'revision', 'revision_date',
    'section', 'prep_time_minutes', 'expected_waste_pct', 'include_labor_cost',
    'selling_price', 'cost', 'labor_cost', 'rating', 'rating_status',
    'taste_profile', 'pos_item_name', 'notes',
    'output_item_sku', 'output_qty', 'output_unit',
]


def _display(value):
    if value is None or value == '':
        return None
    return str(value)


def _ingredient_label(obj):
    sku = obj.item_sku
    note = (obj.prep_note or '').strip()
    return f'{sku} ({note})' if note else sku


def _ingredient_summary(obj):
    return {
        'item_sku': obj.item_sku,
        'item_name_snapshot': obj.item_name_snapshot,
        'prep_note': obj.prep_note,
        'quantity': str(obj.quantity),
        'unit': obj.unit.code if obj.unit_id else None,
    }


def diff_recipes(older, newer):
    """Structured field/ingredient/step diff between two recipe rows
    (either order works; `older`→`newer` is just the labelling)."""
    fields = []
    for name in _DIFF_FIELDS:
        if not hasattr(older, name) or not hasattr(newer, name):
            continue
        a, b = _display(getattr(older, name)), _display(getattr(newer, name))
        if a != b:
            fields.append({'field': name, 'from': a, 'to': b})

    old_ings = {_ingredient_label(i): i for i in older.ingredients.all()}
    new_ings = {_ingredient_label(i): i for i in newer.ingredients.all()}
    ing_changed = []
    for label in old_ings.keys() & new_ings.keys():
        a, b = _ingredient_summary(old_ings[label]), _ingredient_summary(new_ings[label])
        if a != b:
            ing_changed.append({'label': label, 'from': a, 'to': b})

    old_steps = [s.instruction for s in older.steps.all()]
    new_steps = [s.instruction for s in newer.steps.all()]

    return {
        'fields': fields,
        'ingredients': {
            'added': [_ingredient_summary(new_ings[l]) for l in new_ings.keys() - old_ings.keys()],
            'removed': [_ingredient_summary(old_ings[l]) for l in old_ings.keys() - new_ings.keys()],
            'changed': ing_changed,
        },
        'steps': {
            'added': [s for s in new_steps if s not in old_steps],
            'removed': [s for s in old_steps if s not in new_steps],
            'count_from': len(old_steps),
            'count_to': len(new_steps),
        },
    }


def diff_summary(older, newer):
    """One-line-ish counts, for the version timeline."""
    d = diff_recipes(older, newer)
    return {
        'fields_changed': [f['field'] for f in d['fields']],
        'ingredients_added': len(d['ingredients']['added']),
        'ingredients_removed': len(d['ingredients']['removed']),
        'ingredients_changed': len(d['ingredients']['changed']),
        'steps_added': len(d['steps']['added']),
        'steps_removed': len(d['steps']['removed']),
    }


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
