"""
NOTE — Recipe costing
Ingredient cost comes from inventory-platform's live unit_cost per SKU
(apps.integrations.inventory_client), never stored locally per item —
same reasoning as everywhere else in Cookbook: items are read live, not
duplicated.

Known simplification: this assumes a recipe ingredient's unit matches
the item's own base unit in inventory-platform (no cross-unit
conversion applied here). inventory-platform's own recipe costing has
this via its UnitConversion table; wiring that through would mean
pulling that table too via inventory_client, which isn't done yet. Until
then, treat computed cost as approximate whenever a recipe's ingredient
unit differs from the item's base unit.
"""
from decimal import Decimal
from apps.integrations.inventory_client import InventoryClient, InventoryAPIError


def get_inventory_items_by_sku():
    """SKU -> item dict, for one recipe save/recalculate. Not cached across
    requests — authoring-time action, not high-frequency."""
    try:
        items = InventoryClient().get_items()
    except InventoryAPIError:
        return {}
    return {item['sku']: item for item in items}


def calculate_recipe_cost(ingredient_lines, items_by_sku=None):
    """
    ingredient_lines: iterable of objects/dicts with item_sku + quantity.
    Returns (total_cost: Decimal, unknown_skus: list[str]).
    """
    if items_by_sku is None:
        items_by_sku = get_inventory_items_by_sku()

    total = Decimal('0')
    unknown_skus = []
    for line in ingredient_lines:
        sku = line['item_sku'] if isinstance(line, dict) else line.item_sku
        qty = line['quantity'] if isinstance(line, dict) else line.quantity
        item = items_by_sku.get(sku)
        if item is None:
            unknown_skus.append(sku)
            continue
        total += Decimal(str(item.get('unit_cost') or 0)) * Decimal(str(qty))
    return round(total, 3), unknown_skus
