"""
A production recipe's yield is published in the output item's stock unit,
converted with that item's own conversions — inventory-platform has no yield
unit and scales every batch from `output_qty`.

inventory-platform is faked; nothing here touches the network.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import (
    ItemConversion, ItemConversionLine, PrepKitchen, ProductionRecipe,
    ProductionRecipeIngredient, Section,
)
from .support import make_units

User = get_user_model()


class FakeClient:
    def __init__(self, output_stock_code):
        self.items = [{'id': 'itm-1', 'sku': 'B41'},
                      {'id': 'itm-out', 'sku': 'PR-SAUCE', 'unit_code': output_stock_code}]
        self.calls = []

    def get_items(self):
        return self.items

    def get_units(self):
        return [{'id': 'u-g', 'code': 'g'}, {'id': 'u-kg', 'code': 'kg'}, {'id': 'u-l', 'code': 'l'}]

    def sync_recipe_conversions(self, payload):
        return {}

    def create_production_recipe(self, payload):
        self.calls.append(payload)
        return {}

    def update_production_recipe(self, rid, payload):
        self.calls.append(payload)
        return {}

    def find_production_recipe(self, name_en, prep_kitchen_id):
        return {'id': 'inv-1', 'name_en': name_en}


class ProductionYieldTests(APITestCase):
    def setUp(self):
        self.u = make_units()
        section = Section.objects.create(name='Sauce', avg_monthly_salary=Decimal('300'))
        pk = PrepKitchen.objects.get(name_en='Sauce')
        pk.inventory_store_id = 'store-77'
        pk.save(update_fields=['inventory_store_id'])
        self.recipe = ProductionRecipe.objects.create(
            name_en='House Sauce', recipe_code='P9', prep_kitchen_ref=pk, section=section,
            output_item_sku='PR-SAUCE', output_qty=Decimal('5'), output_unit=self.u['Ltr'])
        ProductionRecipeIngredient.objects.create(
            recipe=self.recipe, order=1, item_sku='B41', item_name_snapshot='Garlic',
            quantity=Decimal('500'), unit=self.u['g'])
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(User.objects.create_superuser('boss', password='x'))

    def publish(self, stock_code):
        fake = FakeClient(stock_code)
        with mock.patch('apps.cookbook.publishing.InventoryClient', return_value=fake):
            r = self.client.post(f'/api/cookbook/production-recipes/{self.recipe.id}/publish/')
        return r, fake

    def sauce_weighs(self, grams_per_litre):
        ic = ItemConversion.objects.create(item_sku='PR-SAUCE')
        ItemConversionLine.objects.create(item_conversion=ic, label='1 Ltr',
                                          quantity=Decimal(grams_per_litre), unit=self.u['g'])

    def test_yield_in_the_stock_unit_is_sent_as_is(self):
        r, fake = self.publish('l')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(fake.calls[0]['output_qty'], '5.000')

    def test_litres_of_a_kg_item_use_that_items_own_density(self):
        self.sauce_weighs('1050')                      # this sauce: 1 L = 1.05 kg
        r, fake = self.publish('KG')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(fake.calls[0]['output_qty'], '5.250')
        self.assertTrue(any('published as 5.25 KG' in w for w in r.data['_publish']['warnings']), r.data)

    def test_another_item_converts_with_its_own_numbers(self):
        self.sauce_weighs('1200')                      # a heavier sauce: 1 L = 1.2 kg
        r, fake = self.publish('KG')
        self.assertEqual(fake.calls[0]['output_qty'], '6.000')

    def test_no_conversion_refuses_and_sends_nothing(self):
        r, fake = self.publish('KG')                   # litres, kg stock, no density
        self.assertEqual(r.status_code, 502)
        self.assertIn('Yield 5 Ltr of PR-SAUCE', r.data['detail'])
        self.assertEqual(fake.calls, [])

    def test_kg_batch_of_an_item_stocked_in_boxes(self):
        """Batch made in kg, item kept and dispatched in boxes of 5 kg."""
        ItemConversion.objects.create(item_sku='PR-SAUCE', order_unit='BOX',
                                      pack_qty=Decimal('5'), base_unit=self.u['Kg'])
        self.recipe.output_qty, self.recipe.output_unit = Decimal('20'), self.u['Kg']
        self.recipe.save(update_fields=['output_qty', 'output_unit'])
        r, fake = self.publish('BOX')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(fake.calls[0]['output_qty'], '4.000')
