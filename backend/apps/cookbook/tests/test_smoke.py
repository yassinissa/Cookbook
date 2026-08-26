from decimal import Decimal

from django.test import TestCase

from apps.cookbook.models import Section, UnitScale
from apps.cookbook.services import calculate_recipe_cost, get_inventory_items_by_sku
from .support import fake_inventory_items, item


class ReferenceDataTests(TestCase):
    def test_unit_scale_roundtrips(self):
        u = UnitScale.objects.create(code='g', description='Gram')
        self.assertEqual(str(u), 'g (Gram)')

    def test_section_salary_optional(self):
        s = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.assertEqual(s.avg_monthly_salary, Decimal('285.78'))


class RecipeCostSmokeTests(TestCase):
    """Deep costing coverage is in test_costing.py — this just checks the
    back-compat shim still returns a (total, unknown_skus) tuple."""

    def test_shim_reports_unknown_sku(self):
        total, unknown = calculate_recipe_cost(
            [{'item_sku': 'NOPE', 'quantity': Decimal('10'), 'unit': 'g'}],
            items_by_sku={},
        )
        self.assertEqual(total, Decimal('0.000'))
        self.assertEqual(unknown, ['NOPE'])

    def test_fake_inventory_context(self):
        with fake_inventory_items([item('B1', unit_cost='1.5')]):
            got = get_inventory_items_by_sku()
        self.assertEqual(got['B1']['unit_cost'], '1.5')
