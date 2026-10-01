"""Shared check for the raw `ingredients` dicts on the dish / production write
serializers. Those lists are plain DictFields, so without this a row with no
unit or a blank quantity reached the DB / costing and 500'd the whole save.
Errors are keyed `ingredients[<index>]` so the editor shows them on the row."""
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.cookbook.models import UnitScale


def clean_ingredient_lines(lines):
    """Drop fully blank rows, reject half-filled ones. Returns the kept rows."""
    if lines is None:
        return None
    kept, errors = [], {}
    for i, ing in enumerate(lines):
        sku = str(ing.get('item_sku') or '').strip()
        raw_qty = str(ing.get('quantity') if ing.get('quantity') is not None else '').strip()
        unit = ing.get('unit')
        if not sku and not raw_qty and not unit:
            continue                                   # an untouched empty row
        problems = []
        if not sku:
            problems.append('pick an item')
        try:
            qty = Decimal(raw_qty)
            if not qty.is_finite() or qty <= 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            problems.append('enter a quantity above 0')
        try:
            unit_ok = bool(unit) and UnitScale.objects.filter(pk=unit).exists()
        except (DjangoValidationError, ValueError, TypeError):
            unit_ok = False
        if not unit_ok:
            problems.append('pick a unit')
        if problems:
            label = ing.get('item_name_snapshot') or sku or f'row {i + 1}'
            errors[f'ingredients[{i}]'] = [f'{label}: {", ".join(problems)}.']
            continue
        kept.append({**ing, 'item_sku': sku, 'quantity': raw_qty})
    if errors:
        raise serializers.ValidationError(errors)
    return kept
