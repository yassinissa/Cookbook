"""
Shared test helpers.

Nothing in the test suite is allowed to touch the network. Anywhere the code
would call the inventory-platform API, patch it with `fake_inventory_items`.
"""
from contextlib import contextmanager
from unittest import mock


def item(sku, *, unit_cost=0, unit_code='kg', category='dry', name=None):
    """A single item dict shaped like inventory-platform's ItemListSerializer."""
    return {
        'id': f'id-{sku}',
        'sku': sku,
        'name_en': name or sku,
        'name_ar': '',
        'unit': f'unit-{unit_code}',
        'unit_code': unit_code,
        'unit_name': unit_code,
        'unit_cost': str(unit_cost),
        'category': category,
        'is_active': True,
    }


@contextmanager
def fake_inventory_items(items):
    """
    Patch every path that reaches the inventory API so it returns `items`
    (a list of item dicts — use `item()` to build them).
    """
    with mock.patch(
        'apps.integrations.inventory_client.InventoryClient.get_items',
        return_value=list(items),
    ), mock.patch(
        'apps.integrations.inventory_client.InventoryClient._login',
        return_value=None,
    ):
        yield
