"""
Per-dish nutrition + allergen roll-up.

Nutrition: for every ingredient line, convert its quantity into the unit the
item's ItemNutrition is measured per (g / ml / each), multiply each nutrient by
that, and sum. Lines with no ItemNutrition, or that can't be converted, are
counted in `coverage` so the card can say "9 of 11 ingredients have data".

Allergens: the union of the dish's own allergen tags and every allergen tagged
on an ingredient's item supplement.
"""
from decimal import Decimal

from .units import ConversionError, convert

NUTRIENTS = [
    'calories', 'fat_g', 'protein_g', 'saturated_fat_g', 'trans_fat_g',
    'cholesterol_mg', 'sodium_mg', 'carbs_g', 'fibers_g', 'sugars_g', 'added_sugars_g',
]


def roll_up_nutrition(lines, ctx):
    """
    lines: recipe ingredient lines (dicts or model instances).
    ctx:   a CostContext (has .nutrition, .resolve_unit, .bridges_for).
    Returns {calories: Decimal, ..., '_coverage': {covered, total}}.
    """
    totals = {k: Decimal(0) for k in NUTRIENTS}
    covered = 0
    total = 0

    for line in lines:
        if isinstance(line, dict):
            sku = line.get('item_sku')
            qty = line.get('quantity')
            unit_raw = line.get('unit')
        else:
            sku, qty, unit_raw = line.item_sku, line.quantity, getattr(line, 'unit', None)
        if not sku:
            continue
        total += 1

        n = ctx.nutrition.get(sku)
        unit = ctx.resolve_unit(unit_raw)
        if not n or not n.unit_scale_id or unit is None:
            continue
        try:
            scaled = convert(Decimal(str(qty or 0)), unit, n.unit_scale, ctx.bridges_for(sku))
        except ConversionError:
            continue

        covered += 1
        for k in NUTRIENTS:
            totals[k] += (getattr(n, k) or Decimal(0)) * scaled

    out = {k: v.quantize(Decimal('0.001')) for k, v in totals.items()}
    out['_coverage'] = {'covered': covered, 'total': total}
    return out


def allergen_rollup(recipe):
    """
    -> {
      'dish': ['Gluten', ...],                       # the recipe's own tags
      'from_ingredients': [                           # per ingredient with tags
        {'sku': 'B470', 'name': 'Burgol Brown', 'allergens': ['Gluten']}, ...
      ],
      'all': ['Gluten', 'Sesame', ...],              # the union, sorted
    }
    """
    from .models import ItemConversion

    dish = sorted(a.name for a in recipe.allergens.all())
    lines = list(recipe.ingredients.all())
    supp_by_sku = {
        s.item_sku: s for s in
        ItemConversion.objects
        .filter(item_sku__in=[l.item_sku for l in lines])
        .prefetch_related('allergens')
    }

    from_ingredients = []
    union = set(dish)
    seen = set()
    for line in lines:
        supp = supp_by_sku.get(line.item_sku)
        if not supp or line.item_sku in seen:
            continue
        names = sorted(a.name for a in supp.allergens.all())
        if names:
            seen.add(line.item_sku)
            from_ingredients.append({
                'sku': line.item_sku,
                'name': line.item_name_snapshot or line.item_sku,
                'allergens': names,
            })
            union.update(names)

    return {'dish': dish, 'from_ingredients': from_ingredients, 'all': sorted(union)}
