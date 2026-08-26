"""
Shared test helpers.

Nothing in the test suite is allowed to touch the network. Anywhere the code
would call the inventory-platform API, patch it with `fake_inventory_items`.
"""
from contextlib import contextmanager
from decimal import Decimal
from unittest import mock

from apps.cookbook.models import ItemConversion, ItemConversionLine, UnitScale

# code -> (dimension, factor_to_canonical) — matches the seed / migration 0004
UNITS = {
    'g': ('mass', 1), 'Kg': ('mass', 1000),
    'ml': ('volume', 1), 'Ltr': ('volume', 1000),
    'Tbs': ('volume', 15), 'Ts': ('volume', 5),
    'Cup': ('volume', 240), 'Pinch': ('volume', '0.31'),
    'Pc': ('count', 1), 'Pcs': ('count', 1), 'EA': ('count', 1),
}

# sku -> (base_code, order_cost, pack_qty, grams_per_piece, [(label, qty, unit_code)])
# real values from the store-items sheet
TABBOULEH_ITEMS = {
    'B2018': ('g', '1.400', '1000', None, [('1 Tbs', '3.0', 'g')]),
    'B420':  ('g', '1.221', '350',  None, [('1 Tbs', '6.51', 'g')]),
    'B674':  ('g', '0.948', '1000', None, [('1 Tbs', '1.88', 'g')]),
    'B72':   ('g', '0.450', '1000', '182', [('1 Tbs', '11.0', 'g')]),
    'B271':  ('g', '0.733', '950',  '117', []),
    'B2050': ('ml', '3.250', '1000', None, [('1 Tbs', '15.0', 'ml')]),
    'B470':  ('g', '0.500', '1000', None, []),
    'B13':   ('g', '3.465', '1000', None, [('1 Tbs', '7.0', 'g')]),
}

TABBOULEH_LINES = [
    {'item_sku': 'B2018', 'quantity': '75',  'unit': 'g'},
    {'item_sku': 'B420',  'quantity': '10',  'unit': 'g'},
    {'item_sku': 'B674',  'quantity': '5',   'unit': 'g'},
    {'item_sku': 'B72',   'quantity': '190', 'unit': 'g'},
    {'item_sku': 'B271',  'quantity': '1',   'unit': 'Pc'},
    {'item_sku': 'B2050', 'quantity': '80',  'unit': 'ml'},
    {'item_sku': 'B470',  'quantity': '10',  'unit': 'g'},
    {'item_sku': 'B13',   'quantity': '1',   'unit': 'Pinch'},
    {'item_sku': 'B271',  'quantity': '1',   'unit': 'Pcs'},
]


def make_units():
    """Create the UnitScale rows and return {code: UnitScale}."""
    out = {}
    for code, (dim, factor) in UNITS.items():
        out[code], _ = UnitScale.objects.get_or_create(
            code=code,
            defaults={'description': code, 'dimension': dim,
                      'factor_to_canonical': Decimal(str(factor))},
        )
    return out


def make_item_supplement(units, sku, base_code, order_cost, pack_qty, gpp, lines):
    ic = ItemConversion.objects.create(
        item_sku=sku,
        base_unit=units[base_code],
        order_cost=Decimal(order_cost),
        pack_qty=Decimal(pack_qty),
        grams_per_piece=Decimal(gpp) if gpp else None,
    )
    for label, qty, unit_code in lines:
        ItemConversionLine.objects.create(
            item_conversion=ic, label=label, quantity=Decimal(qty), unit=units[unit_code])
    return ic


def make_tabbouleh_items(units):
    for sku, (base, oc, pq, gpp, lines) in TABBOULEH_ITEMS.items():
        if not ItemConversion.objects.filter(item_sku=sku).exists():
            make_item_supplement(units, sku, base, oc, pq, gpp, lines)


def item(sku, *, unit_cost=0, unit_code='kg', category='dry', name=None):
    """A single item dict shaped like inventory-platform's ItemListSerializer."""
    return {
        'id': f'id-{sku}', 'sku': sku, 'name_en': name or sku, 'name_ar': '',
        'unit': f'unit-{unit_code}', 'unit_code': unit_code, 'unit_name': unit_code,
        'unit_cost': str(unit_cost), 'category': category, 'is_active': True,
    }


@contextmanager
def fake_inventory_items(items):
    """Patch every path that reaches the inventory API so it returns `items`."""
    with mock.patch(
        'apps.integrations.inventory_client.InventoryClient.get_items',
        return_value=list(items),
    ), mock.patch(
        'apps.integrations.inventory_client.InventoryClient._login',
        return_value=None,
    ):
        yield
