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
