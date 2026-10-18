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

    def test_received_inventory_price_beats_the_imported_sheet_cost(self):
        # sheet said 1.400 KWD/kg; inventory's last-receiving average is 2.000 KWD/kg
        self.make_item('K8', 'g', '1.400', '1000', None, [])
        line = [{'item_sku': 'K8', 'quantity': '500', 'unit': 'g'}]
        inv = {'K8': {'sku': 'K8', 'unit_cost': '2.000', 'unit_code': 'kg'}}
        self.assertAlmostEqual(float(cost_recipe(lines=line, items_by_sku=inv)['lines'][0].amount), 1.0, places=6)
        # never received (inventory price 0) or inventory unreachable -> sheet cost
        for fallback in ({'K8': {'sku': 'K8', 'unit_cost': '0', 'unit_code': 'kg'}}, {}):
            lc = cost_recipe(lines=line, items_by_sku=fallback)['lines'][0]
            self.assertAlmostEqual(float(lc.amount), 0.7, places=6)

    def _pack_item(self, sku, base_code, order_unit, pack_qty, gpp=None):
        from apps.cookbook.models import ItemConversion
        return ItemConversion.objects.create(
            item_sku=sku, base_unit=self.units[base_code], order_unit=order_unit,
            pack_qty=Decimal(pack_qty), grams_per_piece=Decimal(gpp) if gpp else None)

    def test_inventory_price_per_packet_uses_pack_size(self):
        # inventory: 3.375 KWD per packet; Cookbook: 1 PKT = 9950 g, no own cost
        self._pack_item('P1', 'g', 'PKT', '9950')
        inv = {'P1': {'sku': 'P1', 'unit_cost': '3.375', 'unit_code': 'packet'}}
        lc = cost_recipe(lines=[{'item_sku': 'P1', 'quantity': '230', 'unit': 'g'}], items_by_sku=inv)['lines'][0]
        self.assertEqual(lc.status, 'ok')
        self.assertAlmostEqual(float(lc.amount), 230 * 3.375 / 9950, places=8)

    def test_inventory_price_per_box_of_pieces(self):
        self._pack_item('P2', 'EA', 'BOX', '2500')
        inv = {'P2': {'sku': 'P2', 'unit_cost': '10.762', 'unit_code': 'box'}}
        lc = cost_recipe(lines=[{'item_sku': 'P2', 'quantity': '1', 'unit': 'EA'}], items_by_sku=inv)['lines'][0]
        self.assertEqual(lc.status, 'ok')
        self.assertAlmostEqual(float(lc.amount), 10.762 / 2500, places=8)

    def test_inventory_pcs_that_is_a_bottle_uses_the_items_pack_size(self):
        # production 2026-10-18: oil stocked per PCS, Cookbook "1 PCS = 1500 ml"
        self._pack_item('B1436', 'ml', 'PCS', '1500')
        inv = {'B1436': {'sku': 'B1436', 'unit_cost': '1.296', 'unit_code': 'pcs'}}
        lc = cost_recipe(lines=[{'item_sku': 'B1436', 'quantity': '100', 'unit': 'ml'}],
                         items_by_sku=inv)['lines'][0]
        self.assertEqual(lc.status, 'ok')
        self.assertAlmostEqual(float(lc.amount), 100 * 1.296 / 1500, places=8)

    def test_pieces_of_a_pcs_pack_are_not_charged_a_whole_pack(self):
        # bay leaves: inventory 1.250 per PCS = a 490 g pack; a leaf is 0.22 g
        self._pack_item('B585', 'g', 'PCS', '490', gpp='0.22')
        inv = {'B585': {'sku': 'B585', 'unit_cost': '1.250', 'unit_code': 'pcs'}}
        lc = cost_recipe(lines=[{'item_sku': 'B585', 'quantity': '3', 'unit': 'Pcs'}],
                         items_by_sku=inv)['lines'][0]
        self.assertEqual(lc.status, 'ok')
        self.assertAlmostEqual(float(lc.amount), 3 * 0.22 * 1.250 / 490, places=8)   # not 3.750

    def test_portion_of_an_ingredient_is_not_costed(self):
        # production 2026-10-18: "2 Portion" of cress (0.33 g a piece) was costed
        # as 2 pieces, "1 Portion" of agar agar as a whole 22.500 KWD pack
        from apps.cookbook.models import UnitScale
        UnitScale.objects.get_or_create(code='Portion', defaults={
            'description': 'Portion', 'dimension': 'count', 'factor_to_canonical': Decimal('1')})
        self._pack_item('B1467', 'g', 'PCS', '50', gpp='0.33')
        inv = {'B1467': {'sku': 'B1467', 'unit_cost': '0.550', 'unit_code': 'pcs'},
               'B1582': {'sku': 'B1582', 'unit_cost': '22.500', 'unit_code': 'pcs'}}
        for sku in inv:
            lc = cost_recipe(lines=[{'item_sku': sku, 'quantity': '2', 'unit': 'Portion'}],
                             items_by_sku=inv)['lines'][0]
            self.assertEqual(lc.status, 'no_conversion')
            self.assertEqual(lc.amount, Decimal('0'))
            self.assertIn('use g, ml or pieces', lc.detail)

    def test_pcs_without_a_pack_size_is_one_piece(self):
        inv = {'T1': {'sku': 'T1', 'unit_cost': '0.148', 'unit_code': 'pcs'}}
        lc = cost_recipe(lines=[{'item_sku': 'T1', 'quantity': '2', 'unit': 'Pcs'}],
                         items_by_sku=inv)['lines'][0]
        self.assertAlmostEqual(float(lc.amount), 0.296, places=6)

    def test_pack_priced_item_without_pack_size_says_what_is_missing(self):
        inv = {'P3': {'sku': 'P3', 'unit_cost': '4.000', 'unit_code': 'bottle'}}
        lc = cost_recipe(lines=[{'item_sku': 'P3', 'quantity': '10', 'unit': 'ml'}], items_by_sku=inv)['lines'][0]
        self.assertEqual(lc.status, 'no_price')
        self.assertIn('per bottle', lc.detail)
        # a pack size for a different unit doesn't count
        self._pack_item('P3', 'ml', 'BOX', '6000')
        lc = cost_recipe(lines=[{'item_sku': 'P3', 'quantity': '10', 'unit': 'ml'}], items_by_sku=inv)['lines'][0]
        self.assertEqual(lc.status, 'no_price')


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
