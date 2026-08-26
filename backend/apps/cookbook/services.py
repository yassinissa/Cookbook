"""
NOTE — Recipe costing (service layer)

The maths lives in apps.cookbook.costing. This module is the seam the
serializers and views call: it fetches the live inventory item list once and
turns a recipe's fields into a full cost breakdown.

Ingredient cost comes from Cookbook's own ItemConversion data (imported from
the store-items sheet), with inventory-platform's unit_cost as a fallback.
Unit conversion IS applied (a recipe line in Tbs against an item priced per Kg
converts correctly); a line that cannot be converted is reported, not guessed.
"""
from decimal import Decimal

from apps.integrations.inventory_client import InventoryClient, InventoryAPIError
from .costing import (
    CostContext, calculate_items_cost, compose_serving_cost, labor_cost,
    pricing_scenarios, serialize_cost_result,
)
from .nutrition import roll_up_nutrition


def get_inventory_items_by_sku():
    """SKU -> item dict, for one recipe save/recalculate. Not cached across
    requests — authoring-time action, not high-frequency. Returns {} if the
    inventory API is unreachable (costing then falls back to Cookbook data
    only, and lines with no Cookbook price are flagged)."""
    try:
        items = InventoryClient().get_items()
    except InventoryAPIError:
        return {}
    return {item['sku']: item for item in items}


def _skus(lines):
    for l in lines:
        yield l.get('item_sku') if isinstance(l, dict) else l.item_sku


def calculate_recipe_cost(ingredient_lines, items_by_sku=None):
    """
    Back-compat shim — returns (items_total: Decimal, unknown_skus: list[str]).
    New code should call cost_recipe() for the full breakdown.
    """
    ingredient_lines = list(ingredient_lines)
    if items_by_sku is None:
        items_by_sku = get_inventory_items_by_sku()
    ctx = CostContext(_skus(ingredient_lines), items_by_sku)
    result = calculate_items_cost(ingredient_lines, ctx)
    return result.items_total.quantize(Decimal('0.001')), result.unknown_skus


def cost_recipe(*, lines, section=None, prep_minutes=None, expected_waste_pct=0,
                include_labor=True, selling_price=None, output_qty=None,
                items_by_sku=None):
    """
    Full cost breakdown for one recipe.

    Returns a dict with: items_total, lines (list[LineCost]), issues,
    labor (Decimal), breakdown {items, waste, labor, per_serving},
    scenarios, and food_cost_pct / revenue_pct / cost_per_unit where the
    inputs allow.
    """
    lines = list(lines)
    if items_by_sku is None:
        items_by_sku = get_inventory_items_by_sku()
    ctx = CostContext(_skus(lines), items_by_sku)

    result = calculate_items_cost(lines, ctx)
    labor = labor_cost(section, prep_minutes)
    breakdown = compose_serving_cost(result.items_total, expected_waste_pct, labor, include_labor)
    per_serving = breakdown['per_serving_raw']   # unrounded for %/per-unit maths

    out = {
        'items_total': breakdown['items'],   # rounded for display
        'lines': result.lines,
        'issues': result.issues,
        'unknown_skus': result.unknown_skus,
        'labor': breakdown['labor'],
        'breakdown': breakdown,
        'scenarios': pricing_scenarios(per_serving),
        'nutrition': roll_up_nutrition(lines, ctx),
        'food_cost_pct': None,
        'revenue_pct': None,
        'cost_per_unit': None,
    }
    if selling_price:
        sp = Decimal(selling_price)
        if sp > 0:
            fc = (per_serving / sp * 100).quantize(Decimal('0.01'))
            out['food_cost_pct'] = fc
            out['revenue_pct'] = (Decimal(100) - fc).quantize(Decimal('0.01'))
    if output_qty:
        oq = Decimal(output_qty)
        if oq > 0:
            out['cost_per_unit'] = (per_serving / oq).quantize(Decimal('0.001'))
    return out


def apply_cost(recipe, ingredient_lines=None, items_by_sku=None):
    """
    Recompute cost / labor_cost / cost_breakdown onto a recipe instance
    (in memory — caller saves). `ingredient_lines` defaults to the recipe's
    own saved ingredients; pass the raw write-serializer dicts when the
    ingredients aren't persisted yet.

    Stashes `_unknown_skus` and `_cost_issues` on the instance for the view
    to surface as response warnings.
    """
    lines = ingredient_lines if ingredient_lines is not None else list(recipe.ingredients.all())
    result = cost_recipe(
        lines=lines,
        section=recipe.section,
        prep_minutes=recipe.prep_time_minutes,
        expected_waste_pct=recipe.expected_waste_pct or 0,
        include_labor=recipe.include_labor_cost,
        selling_price=getattr(recipe, 'selling_price', None),
        output_qty=getattr(recipe, 'output_qty', None),
        items_by_sku=items_by_sku,
    )
    recipe.cost = result['breakdown']['per_serving']
    recipe.labor_cost = result['labor']
    recipe.cost_breakdown = serialize_cost_result(result)
    recipe.nutrition = {k: (str(v) if hasattr(v, 'quantize') else v) for k, v in result['nutrition'].items()}
    recipe._unknown_skus = result['unknown_skus']
    recipe._cost_issues = [
        {'sku': lc.sku, 'status': lc.status, 'detail': lc.detail} for lc in result['issues']
    ]
    return result
