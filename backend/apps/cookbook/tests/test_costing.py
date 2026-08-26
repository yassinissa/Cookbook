"""
Costing engine tests. The headline case is Tabbouleh Salad, whose numbers come
straight from the source cook book's "Menu To DOR" sheet:

    items cost   = 0.6761949  KWD
    labour       = 0.0686971  KWD   (Salad section, 3 min prep)
    waste        = 0.0067619  KWD   (1 %)
    per serving  = 0.7516540  KWD
    food cost %  = 25.92 %          (selling price 2.900)
"""
from decimal import Decimal

from django.test import TestCase

from apps.cookbook.models import Section
from apps.cookbook.costing import compose_serving_cost, labor_cost, pricing_scenarios
from apps.cookbook.services import cost_recipe
from .support import (
    TABBOULEH_LINES, make_item_supplement, make_tabbouleh_items, make_units,
)


class CostingTestBase(TestCase):
    def setUp(self):
        self.units = make_units()

    def make_item(self, sku, base_code, order_cost, pack_qty, gpp, lines):
        return make_item_supplement(self.units, sku, base_code, order_cost, pack_qty, gpp, lines)


class LineConversionTests(CostingTestBase):
    def _one(self, sku_setup, line):
        self.make_item(*sku_setup)
        return cost_recipe(lines=[line], items_by_sku={})['lines'][0]

    def test_grams_priced_per_kg(self):
        lc = self._one(('X1', 'g', '1.400', '1000', None, []),
                       {'item_sku': 'X1', 'quantity': '75', 'unit': 'g'})
        self.assertEqual(lc.status, 'ok')
        self.assertAlmostEqual(float(lc.amount), 0.105, places=6)

    def test_tbs_against_gram_priced_item(self):
        lc = self._one(('X2', 'g', '1.400', '1000', None, [('1 Tbs', '3.0', 'g')]),
                       {'item_sku': 'X2', 'quantity': '2', 'unit': 'Tbs'})
        self.assertEqual(lc.status, 'ok')
        self.assertAlmostEqual(float(lc.amount), 0.0084, places=6)   # 2 Tbs -> 6 g

    def test_piece_against_gram_priced_item(self):
        lc = self._one(('X3', 'g', '0.733', '950', '117', []),
                       {'item_sku': 'X3', 'quantity': '1', 'unit': 'Pc'})
        self.assertEqual(lc.status, 'ok')
        self.assertAlmostEqual(float(lc.amount), 117 * 0.733 / 950, places=8)

    def test_no_conversion_is_flagged_not_zeroed_silently(self):
        lc = self._one(('X4', 'g', '1.0', '1000', None, []),
                       {'item_sku': 'X4', 'quantity': '1', 'unit': 'Pc'})
        self.assertEqual(lc.status, 'no_conversion')
        self.assertEqual(lc.amount, Decimal('0'))

    def test_unknown_sku(self):
        out = cost_recipe(lines=[{'item_sku': 'NOPE', 'quantity': '1', 'unit': 'g'}], items_by_sku={})
        self.assertEqual(out['lines'][0].status, 'unknown_sku')
        self.assertEqual(out['unknown_skus'], ['NOPE'])

    def test_inventory_price_fallback(self):
        inv = {'K9': {'sku': 'K9', 'unit_cost': '2.000', 'unit_code': 'kg'}}
        out = cost_recipe(lines=[{'item_sku': 'K9', 'quantity': '500', 'unit': 'g'}], items_by_sku=inv)
        self.assertEqual(out['lines'][0].status, 'ok')
        self.assertAlmostEqual(float(out['lines'][0].amount), 1.0, places=6)


class LabourTests(CostingTestBase):
    def test_salad_three_minutes(self):
        s = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.assertAlmostEqual(float(labor_cost(s, 3)), 0.0686971153846, places=10)

    def test_no_section_no_labour(self):
        self.assertEqual(labor_cost(None, 5), Decimal('0'))

    def test_no_prep_time_no_labour(self):
        s = Section.objects.create(name='Grill', avg_monthly_salary=Decimal('258.23'))
        self.assertEqual(labor_cost(s, None), Decimal('0'))


class CompositionTests(CostingTestBase):
    def test_waste_and_scenarios(self):
        b = compose_serving_cost(Decimal('0.6761949'), Decimal('1'), Decimal('0.0686971'))
        self.assertEqual(b['items'], Decimal('0.676'))
        self.assertEqual(b['per_serving'], Decimal('0.752'))
        sc = pricing_scenarios(b['per_serving'])
        self.assertEqual((sc[0]['markup'], sc[0]['price'], sc[0]['cost_pct']),
                         (2, Decimal('1.504'), Decimal('50.00')))


class TabboulehAcceptanceTests(CostingTestBase):
    def setUp(self):
        super().setUp()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))

    def test_matches_the_cook_book(self):
        out = cost_recipe(
            lines=TABBOULEH_LINES, section=self.section, prep_minutes=3,
            expected_waste_pct=Decimal('1'), selling_price=Decimal('2.900'),
            items_by_sku={},
        )
        self.assertEqual(out['issues'], [], f'unexpected costing issues: {out["issues"]}')
        self.assertAlmostEqual(float(out['items_total']), 0.6761949, places=3)
        self.assertAlmostEqual(float(out['breakdown']['per_serving']), 0.7516540, places=3)
        self.assertAlmostEqual(float(out['food_cost_pct']), 25.92, places=1)
        self.assertAlmostEqual(float(out['revenue_pct']), 74.08, places=1)
