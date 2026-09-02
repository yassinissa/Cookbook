"""
Slice 3c — publishing a dish's POS modifier data to inventory-platform.

After the recipe push, `publish_dish_recipe` pushes a POSItemMapping for the
base dish + each `type` option's variant recipe, and a POSAddonIngredient for
each `addon` option. Missing pos_mods_string / unpublished variant / unknown
SKU become warnings, never hard failures. The client is faked.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeIngredient, ModifierGroup, ModifierOption,
    DishModifierGroup, UnitScale,
)

User = get_user_model()


class FakeClient:
    def __init__(self):
        self._items = [{'id': 'itm-garlic', 'sku': 'B41'}, {'id': 'itm-cheese', 'sku': 'B45'}]
        self._units = [{'id': 'u-g', 'code': 'g'}]
        self.mappings = []   # (pos_item_name, pos_modifier, dish_recipe)
        self.addons = []     # (modifier_name, item, quantity, unit)

    def get_items(self):
        return self._items

    def get_units(self):
        return self._units

    def create_dish_recipe(self, payload):
        return {'name_en': payload['name_en']}

    def update_dish_recipe(self, rid, payload):
        return {'name_en': payload['name_en']}

    def find_dish_recipe(self, name_en):
        return {'id': 'inv-dish-1', 'name_en': name_en, 'is_current': True}

    def upsert_pos_mapping(self, pos_item_name, pos_modifier, dish_recipe_id):
        self.mappings.append((pos_item_name, pos_modifier or '', dish_recipe_id))
        return {'id': 'map-1'}

    def upsert_pos_addon(self, modifier_name, item_id, quantity, unit_id=None):
        self.addons.append((modifier_name, item_id, str(quantity), unit_id))
        return {'id': 'add-1'}


def _patch(fake):
    return mock.patch('apps.cookbook.publishing.InventoryClient', return_value=fake)


class PosPublishTests(APITestCase):
    def setUp(self):
        self.g = UnitScale.objects.create(code='g', description='g', dimension='mass', factor_to_canonical=1)
        self.branch = Branch.objects.create(name_en='Dine', code='DINE', sort_order=1)
        self.dish = DishRecipe.objects.create(
            name_en='Meat Arayes', recipe_code='ARY', branch_ref=self.branch,
            pos_item_name='Meat Arayes', selling_price=Decimal('3.75'), cost=Decimal('1.0'))
        DishRecipeIngredient.objects.create(recipe=self.dish, order=1, item_sku='B41',
                                            item_name_snapshot='Garlic', quantity=Decimal('20'), unit=self.g)
        # a published variant recipe for a `type` option
        self.chicken = DishRecipe.objects.create(
            name_en='Chicken Arayes', recipe_code='ARYC', branch_ref=self.branch,
            inventory_recipe_id='inv-chicken', selling_price=Decimal('3.60'), cost=Decimal('0.9'))

        self.roll = ModifierGroup.objects.create(name_en='RoLL', selection='single', min_select=1)
        self.opt_chicken = ModifierOption.objects.create(
            group=self.roll, name_en='Chicken', kind='type', price_delta=Decimal('5.45'),
            pos_mods_string='(C) CHICKEN', variant_recipe=self.chicken)
        self.opt_sauce = ModifierOption.objects.create(
            group=self.roll, name_en='Garlic Sauce', kind='addon', price_delta=Decimal('0.25'),
            pos_mods_string='GARLIC SAUCE', item_sku='B45', quantity=Decimal('15'), unit=self.g)
        DishModifierGroup.objects.create(dish=self.dish, group=self.roll, default_role='forced')

        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def _publish(self):
        return self.client.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')

    def test_base_mapping_type_mapping_and_addon_are_pushed(self):
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(set(fake.mappings), {
            ('Meat Arayes', '', 'inv-dish-1'),          # base
            ('Meat Arayes', '(C) CHICKEN', 'inv-chicken'),  # the `type` variant
        })
        self.assertEqual(fake.addons, [('GARLIC SAUCE', 'itm-cheese', '15.000', 'u-g')])
        self.assertEqual(r.data['_publish']['warnings'], [])

    def test_dish_with_no_modifiers_pushes_nothing(self):
        DishModifierGroup.objects.filter(dish=self.dish).delete()
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(fake.mappings, [])
        self.assertEqual(fake.addons, [])

    def test_missing_pos_mods_string_is_a_warning(self):
        self.opt_chicken.pos_mods_string = ''
        self.opt_chicken.save()
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertNotIn(('Meat Arayes', '', 'inv-dish-1'), [(*m[:2], m[2]) for m in fake.mappings if m[1]])
        self.assertTrue(any('no POS' in w and 'Chicken' in w for w in r.data['_publish']['warnings']))
        # the add-on still went through
        self.assertEqual(len(fake.addons), 1)

    def test_unpublished_variant_is_a_warning(self):
        self.chicken.inventory_recipe_id = ''
        self.chicken.save()
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertTrue(any('variant recipe not published' in w for w in r.data['_publish']['warnings']))
        self.assertEqual(len(fake.mappings), 1)   # only the base

    def test_unknown_addon_sku_is_a_warning(self):
        self.opt_sauce.item_sku = 'NOPE'
        self.opt_sauce.save()
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertEqual(fake.addons, [])
        self.assertTrue(any('NOPE' in w for w in r.data['_publish']['warnings']))
