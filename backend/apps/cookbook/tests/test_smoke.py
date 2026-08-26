from decimal import Decimal

from django.test import TestCase

from apps.cookbook.models import DishRecipe, Section, UnitScale
from apps.cookbook.services import calculate_recipe_cost
from .support import fake_inventory_items, item


class ReferenceDataTests(TestCase):
    def test_unit_scale_roundtrips(self):
        u = UnitScale.objects.create(code='g', description='Gram')
        self.assertEqual(str(u), 'g (Gram)')

    def test_section_salary_optional(self):
        s = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.assertEqual(s.avg_monthly_salary, Decimal('285.78'))


class RecipeCostSmokeTests(TestCase):
    def test_calculate_recipe_cost_sums_known_lines(self):
        lines = [
            {'item_sku': 'B1', 'quantity': Decimal('100')},
            {'item_sku': 'B2', 'quantity': Decimal('50')},
        ]
        items = {
            'B1': item('B1', unit_cost='0.0014'),
            'B2': item('B2', unit_cost='0.002'),
        }
        total, unknown = calculate_recipe_cost(lines, items_by_sku=items)
        self.assertEqual(unknown, [])
        # current engine: qty * unit_cost, no conversion yet
        self.assertEqual(total, Decimal('0.240'))

    def test_unknown_sku_is_reported_not_fatal(self):
        lines = [{'item_sku': 'NOPE', 'quantity': Decimal('10')}]
        total, unknown = calculate_recipe_cost(lines, items_by_sku={})
        self.assertEqual(total, Decimal('0'))
        self.assertEqual(unknown, ['NOPE'])

    def test_fake_inventory_context(self):
        with fake_inventory_items([item('B1', unit_cost='1.5')]):
            from apps.cookbook.services import get_inventory_items_by_sku
            got = get_inventory_items_by_sku()
        self.assertIn('B1', got)
        self.assertEqual(got['B1']['unit_cost'], '1.5')
