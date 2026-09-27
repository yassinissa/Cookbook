"""
Per-item conversion of recipe units into each item's inventory stock unit:
the maths (stock_units.ItemUnits), the checks + sync a publish does before
pushing a recipe, and the sync on an item-conversion edit.

inventory-platform is faked; nothing here touches the network.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.costing import CostContext, cost_line
from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeIngredient, ItemConversion, ItemConversionLine, Section,
)
from apps.cookbook.publishing import RecipePublishError, publish_dish_recipe
from apps.cookbook.stock_units import ItemUnits
from .support import make_units

User = get_user_model()


def supplement(units, sku, *, order_unit='', pack_qty=None, base=None, order_cost=None,
               gpp=None, lines=()):
    ic = ItemConversion.objects.create(
        item_sku=sku, order_unit=order_unit,
        pack_qty=Decimal(pack_qty) if pack_qty else None,
        base_unit=units[base] if base else None,
        order_cost=Decimal(order_cost) if order_cost else None,
        grams_per_piece=Decimal(gpp) if gpp else None)
    for label, qty, unit_code, *grams in lines:
        ItemConversionLine.objects.create(
            item_conversion=ic, label=label, quantity=Decimal(qty), unit=units[unit_code],
            gram_equivalent=Decimal(grams[0]) if grams else None)
    return ic


def iu(sku, stock_code):
    return ItemUnits(sku, stock_code, CostContext([sku]))


class ItemUnitsTests(TestCase):
    def setUp(self):
        self.u = make_units()

    def test_measure_stock_unit_with_the_items_tablespoon(self):
        supplement(self.u, 'PARSLEY', lines=[('1 Tbs', '25', 'g')])
        p = iu('PARSLEY', 'KG')
        self.assertEqual(p.factor(self.u['Tbs']), Decimal('0.025'))       # 25 g of 1000
        self.assertEqual(p.factor(self.u['g']), Decimal('0.001'))
        self.assertIsNone(p.factor(self.u['Pc']))                          # no piece size

    def test_pack_stock_unit_uses_the_items_pack_size(self):
        supplement(self.u, 'SUMAC', order_unit='PKT', pack_qty='500', base='g',
                   lines=[('1 Tbs', '8', 'g')])
        s = iu('SUMAC', 'PKT')
        self.assertEqual(s.factor(self.u['g']), Decimal('0.002'))
        self.assertEqual(s.factor(self.u['Tbs']), Decimal('0.016'))
        self.assertEqual(s.factor(self.u['Kg']), Decimal('2'))

    def test_dune_sauce_own_tablespoon_beats_the_standard_one(self):
        """The user's example: 1 Tbs of dune sauce = 0.05 L and = 50 g. That
        applies to dune sauce only; another sauce keeps its own numbers."""
        supplement(self.u, 'DUNE', order_unit='PCS', pack_qty='2', base='Ltr',
                   lines=[('1 Tbs', '0.05', 'Ltr', '50')])
        supplement(self.u, 'SOY', order_unit='PCS', pack_qty='2', base='Ltr')
        dune, soy = iu('DUNE', 'PCS'), iu('SOY', 'PCS')

        self.assertEqual(dune.factor(self.u['Tbs']), Decimal('0.025'))    # 50 ml of 2000 ml
        self.assertEqual(dune.factor(self.u['g']), Decimal('0.0005'))      # 1 g = 1 ml of this sauce
        self.assertEqual(soy.factor(self.u['Tbs']), Decimal('0.0075'))     # standard 15 ml Tbs
        self.assertIsNone(soy.factor(self.u['g']))                         # soy has no density
        self.assertIn('1 Tbs = 0.05 Ltr', dune.label(self.u['Tbs']))

    def test_density_uses_the_items_own_tablespoon(self):
        """Same data as two separate lines: "1 Tbs = 0.05 Ltr" and "1 Tbs =
        50 g" means 50 ml weighs 50 g here, not 15 ml (a standard Tbs)."""
        supplement(self.u, 'DUNE', order_unit='PCS', pack_qty='2', base='Ltr',
                   lines=[('1 Tbs', '0.05', 'Ltr'), ('1 Tbs', '50', 'g')])
        dune = iu('DUNE', 'PCS')
        self.assertEqual(dune.factor(self.u['Tbs']), Decimal('0.025'))
        self.assertEqual(dune.factor(self.u['g']), Decimal('0.0005'))
        self.assertEqual(dune.factor(self.u['Kg']), Decimal('0.5'))

    def test_pack_without_size_or_with_a_different_order_unit_is_reported(self):
        supplement(self.u, 'RICE', order_unit='BOX', pack_qty='10', base='Kg')
        rice = iu('RICE', 'PKT')
        self.assertIsNone(rice.anchor)
        self.assertIsNone(rice.factor(self.u['g']))
        self.assertIn('1 BOX = 10 Kg', rice.problem)
        self.assertIsNone(iu('NOTHING', 'BOX').anchor)

    def test_piece_stock_unit_without_pack_is_one_piece(self):
        supplement(self.u, 'EGG', gpp='60')
        egg = iu('EGG', 'PCS')
        self.assertEqual(egg.factor(self.u['Pc']), Decimal('1'))
        self.assertEqual(round(egg.factor(self.u['g']), 6), Decimal('0.016667'))

    def test_costing_uses_the_items_own_tablespoon_too(self):
        supplement(self.u, 'DUNE', order_unit='PCS', pack_qty='2000', base='ml', order_cost='4',
                   lines=[('1 Tbs', '50', 'ml')])
        ctx = CostContext(['DUNE'])
        line = cost_line({'item_sku': 'DUNE', 'quantity': '2', 'unit': self.u['Tbs']}, ctx)
        self.assertEqual(line.amount, Decimal('0.2'))      # 100 ml x 0.002 KWD/ml (not 30 ml)


class FakeClient:
    def __init__(self, items, units, sync_result=None, sync_error=None):
        self._items, self._units = items, units
        self.calls, self.synced = [], []
        self.sync_result, self.sync_error = sync_result or {'updated': [], 'skipped': []}, sync_error

    def get_items(self):
        return self._items

    def get_units(self):
        return self._units

    def search_items(self, params):
        return {'results': [i for i in self._items if i['sku'] == params['search']]}

    def sync_recipe_conversions(self, items):
        if self.sync_error:
            raise self.sync_error
        self.synced.append(items)
        return self.sync_result

    def create_dish_recipe(self, payload):
        self.calls.append(('create', payload))

    def update_dish_recipe(self, rid, payload):
        self.calls.append(('update', payload))

    def find_dish_recipe(self, name_en, brand=''):
        return {'id': 'inv-1', 'name_en': name_en, 'is_current': True}

    def upsert_pos_mapping(self, *a):
        pass


INV_UNITS = [{'id': 'u-g', 'code': 'g'}, {'id': 'u-kg', 'code': 'KG'}, {'id': 'u-ml', 'code': 'ml'},
             {'id': 'u-l', 'code': 'LTR'}, {'id': 'u-tbsp', 'code': 'tbsp'},
             {'id': 'u-pcs', 'code': 'PCS'}, {'id': 'u-pkt', 'code': 'PKT'}]


class PublishChecksTests(TestCase):
    def setUp(self):
        self.u = make_units()
        branch = Branch.objects.create(name_en='WnR', sort_order=1)
        self.dish = DishRecipe.objects.create(
            name_en='Fattoush', recipe_code='D1', branch_ref=branch,
            section=Section.objects.create(name='Cold'))
        self.items = [
            {'id': 'i-sumac', 'sku': 'SUMAC', 'unit_code': 'PKT'},
            {'id': 'i-parsley', 'sku': 'PARSLEY', 'unit_code': 'KG'},
            {'id': 'i-bun', 'sku': 'BUN', 'unit_code': 'PCS'},
        ]
        supplement(self.u, 'SUMAC', order_unit='PKT', pack_qty='500', base='g',
                   lines=[('1 Tbs', '8', 'g')])
        supplement(self.u, 'PARSLEY')

    def _line(self, sku, qty, unit, order=1):
        DishRecipeIngredient.objects.create(recipe=self.dish, order=order, item_sku=sku,
                                            item_name_snapshot=sku.title(), quantity=Decimal(qty),
                                            unit=self.u[unit])

    def test_publishes_recipe_units_and_syncs_the_items_conversions_first(self):
        self._line('SUMAC', '2', 'Tbs')
        self._line('PARSLEY', '75', 'g', order=2)
        fake = FakeClient(self.items, INV_UNITS)
        publish_dish_recipe(self.dish, client=fake)

        lines = fake.calls[0][1]['ingredients']
        self.assertEqual([(l['item'], l['quantity'], l['unit']) for l in lines],
                         [('i-sumac', '2.000', 'u-tbsp'), ('i-parsley', '75.000', 'u-g')])
        rows = {r['sku']: {c['unit']: Decimal(c['factor']) for c in r['conversions']}
                for r in fake.synced[0]}
        self.assertEqual(rows['SUMAC']['tbsp'], Decimal('0.016'))
        self.assertEqual(rows['SUMAC']['g'], Decimal('0.002'))
        self.assertNotIn('PKT', rows['SUMAC'])                   # the stock unit itself
        self.assertEqual(rows['PARSLEY']['g'], Decimal('0.001'))

    def test_a_line_that_cant_be_converted_stops_the_publish(self):
        self._line('PARSLEY', '2', 'Tbs')                        # parsley has no Tbs weight
        fake = FakeClient(self.items, INV_UNITS)
        with self.assertRaises(RecipePublishError) as cm:
            publish_dish_recipe(self.dish, client=fake)
        self.assertIn('PARSLEY', str(cm.exception))
        self.assertIn('no conversion from Tbs to its stock unit KG', str(cm.exception))
        self.assertEqual(fake.calls, [])                         # nothing pushed
        self.assertEqual(fake.synced, [])

    def test_unanchored_pack_stops_the_publish_with_what_to_fill_in(self):
        self.items.append({'id': 'i-rice', 'sku': 'RICE', 'unit_code': 'PKT'})
        self._line('RICE', '100', 'g')
        with self.assertRaises(RecipePublishError) as cm:
            publish_dish_recipe(self.dish, client=FakeClient(self.items, INV_UNITS))
        self.assertIn('set how much one PKT holds', str(cm.exception))

    def test_piece_of_a_multi_piece_pack_is_sent_in_grams(self):
        """BUN is stocked as PCS = a bag of 6 buns (360 g). A recipe's "1 Pc"
        is one bun, but PCS on the platform is the bag, so the line goes out
        as 60 g, with a warning, and the g factor is synced."""
        supplement(self.u, 'BUN', order_unit='PCS', pack_qty='360', base='g', gpp='60')
        self._line('BUN', '1', 'Pc')
        fake = FakeClient(self.items, INV_UNITS)
        result = publish_dish_recipe(self.dish, client=fake)
        line = fake.calls[0][1]['ingredients'][0]
        self.assertEqual((line['quantity'], line['unit']), ('60.000', 'u-g'))
        self.assertTrue(any('published as 60.000 g' in w for w in result['warnings']))

    def test_sync_failure_stops_the_publish(self):
        from apps.integrations.inventory_client import InventoryAPIError
        self._line('SUMAC', '2', 'Tbs')
        fake = FakeClient(self.items, INV_UNITS, sync_error=InventoryAPIError('boom'))
        with self.assertRaises(RecipePublishError):
            publish_dish_recipe(self.dish, client=fake)
        self.assertEqual(fake.calls, [])


class ConversionEditSyncTests(APITestCase):
    def setUp(self):
        self.u = make_units()
        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)
        self.fake = FakeClient([{'id': 'i-sumac', 'sku': 'SUMAC', 'unit_code': 'PKT'}], INV_UNITS,
                               sync_result={'updated': ['SUMAC'], 'skipped': []})
        patcher = mock.patch('apps.cookbook.publishing.InventoryClient', return_value=self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_saving_an_items_conversions_pushes_them(self):
        res = self.client.post('/api/cookbook/item-conversions/', {
            'item_sku': 'SUMAC', 'order_unit': 'PKT', 'pack_qty': '500',
            'base_unit': str(self.u['g'].id),
            'lines': [{'label': '1 Tbs', 'quantity': '8', 'unit': str(self.u['g'].id)}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data['inventory_sync'], {'ok': True, 'problems': [], 'skipped': []})
        rows = {c['unit']: Decimal(c['factor']) for c in self.fake.synced[-1][0]['conversions']}
        self.assertEqual(rows['tbsp'], Decimal('0.016'))

        # an edit re-sends the item's whole table
        self.client.patch('/api/cookbook/item-conversions/SUMAC/', {
            'lines': [{'label': '1 Tbs', 'quantity': '10', 'unit': str(self.u['g'].id)}],
        }, format='json')
        rows = {c['unit']: Decimal(c['factor']) for c in self.fake.synced[-1][0]['conversions']}
        self.assertEqual(rows['tbsp'], Decimal('0.02'))

    def test_changing_the_order_unit_keeps_the_cost_per_base_unit(self):
        supplement(self.u, 'RICE', order_unit='BOX', pack_qty='10', base='Kg', order_cost='20')
        self.client.patch('/api/cookbook/item-conversions/RICE/',
                          {'order_unit': 'PKT', 'pack_qty': '0.5'}, format='json')
        ic = ItemConversion.objects.get(item_sku='RICE')
        self.assertIsNone(ic.order_cost)                       # a BOX price means nothing per PKT
        self.assertEqual(ic.cost_per_base_unit, Decimal('2'))  # still 2 KWD per Kg

        # correcting the pack size alone keeps the pack price
        ic.order_cost = Decimal('1')
        ic.save()
        self.client.patch('/api/cookbook/item-conversions/RICE/', {'pack_qty': '0.4'}, format='json')
        ic.refresh_from_db()
        self.assertEqual((ic.order_cost, ic.pack_qty), (Decimal('1'), Decimal('0.4')))

    def test_unreachable_inventory_does_not_fail_the_save(self):
        from apps.integrations.inventory_client import InventoryAPIError
        self.fake.sync_error = InventoryAPIError('could not reach the server')
        res = self.client.post('/api/cookbook/item-conversions/', {
            'item_sku': 'SUMAC', 'order_unit': 'PKT', 'pack_qty': '500',
            'base_unit': str(self.u['g'].id)}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertFalse(res.data['inventory_sync']['ok'])
