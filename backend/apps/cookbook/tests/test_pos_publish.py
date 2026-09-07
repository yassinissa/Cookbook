"""
Publishing a dish's POS modifier data to inventory-platform.

After the recipe push, `publish_dish_recipe` pushes:
  - a POSItemMapping for the base dish,
  - a POSItemMapping for each `type` option with a published variant recipe,
  - a POSModifierIngredient per +/- delta for every other option that carries
    deltas (add-ons, removals, delta-modelled picks).
`no_consumption_impact` options push nothing. `needs_data` options / missing
match key / unknown SKU become warnings, never hard failures. Client is faked.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeIngredient, ModifierGroup, ModifierOption,
    ModifierOptionIngredient, DishModifierGroup, UnitScale,
)

User = get_user_model()


class FakeClient:
    def __init__(self):
        self._items = [
            {'id': 'itm-garlic', 'sku': 'B41'}, {'id': 'itm-cheese', 'sku': 'B45'},
            {'id': 'itm-crab', 'sku': 'CRB'},
        ]
        self._units = [{'id': 'u-g', 'code': 'g'}]
        self.mappings = []      # (pos_item_name, pos_modifier, dish_recipe_id)
        self.deltas = []        # (pos_item_name, pos_modifier, item, qty, unit, direction)
        self.pruned = []        # (pos_item_name, pos_modifier)

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

    def upsert_pos_modifier_ingredient(self, pos_item_name, pos_modifier, item_id,
                                       quantity, unit_id=None, direction='add'):
        self.deltas.append((pos_item_name, pos_modifier or '', item_id, str(quantity), unit_id, direction))
        return {'id': 'delta-1'}

    def delete_pos_modifier_ingredients(self, pos_item_name, pos_modifier):
        self.pruned.append((pos_item_name, pos_modifier or ''))


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
        self.chicken = DishRecipe.objects.create(
            name_en='Chicken Arayes', recipe_code='ARYC', branch_ref=self.branch,
            inventory_recipe_id='inv-chicken', selling_price=Decimal('3.60'), cost=Decimal('0.9'))

        self.roll = ModifierGroup.objects.create(name_en='RoLL', selection='single', min_select=1)
        self.opt_chicken = ModifierOption.objects.create(
            group=self.roll, name_en='Chicken', kind='type', price_delta=Decimal('5.45'),
            pos_mods_string='(C) CHICKEN', variant_recipe=self.chicken)
        self.opt_sauce = ModifierOption.objects.create(
            group=self.roll, name_en='Garlic Sauce', kind='addon', price_delta=Decimal('0.25'),
            pos_mods_string='GARLIC SAUCE')
        ModifierOptionIngredient.objects.create(option=self.opt_sauce, item_sku='B45',
                                                item_name_snapshot='Cheese', quantity=Decimal('15'),
                                                unit=self.g, direction='add')
        DishModifierGroup.objects.create(dish=self.dish, group=self.roll, default_role='forced')

        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def _publish(self):
        return self.client.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')

    def _warnings(self, r):
        return r.data['_publish']['warnings']

    def test_base_mapping_variant_mapping_and_delta_are_pushed(self):
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(set(fake.mappings), {
            ('Meat Arayes', '', 'inv-dish-1'),
            ('Meat Arayes', '(C) CHICKEN', 'inv-chicken'),
        })
        self.assertEqual(fake.deltas, [
            ('Meat Arayes', 'GARLIC SAUCE', 'itm-cheese', '15.000', 'u-g', 'add'),
        ])
        self.assertEqual(self._warnings(r), [])

    def test_removal_delta_is_published_as_remove(self):
        removal = ModifierOption.objects.create(
            group=self.roll, name_en='No Crab', kind='instruction', pos_mods_string='NO CRAB')
        ModifierOptionIngredient.objects.create(option=removal, item_sku='CRB',
                                                item_name_snapshot='Crab', quantity=Decimal('40'),
                                                unit=self.g, direction='remove')
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertIn(('Meat Arayes', 'NO CRAB', 'itm-crab', '40.000', 'u-g', 'remove'), fake.deltas)
        self.assertEqual(self._warnings(r), [])

    def test_no_impact_option_publishes_nothing_and_does_not_warn(self):
        ModifierOption.objects.create(
            group=self.roll, name_en='Well Done', kind='instruction',
            pos_mods_string='WELL DONE', no_consumption_impact=True)
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertFalse(any('Well Done' in w for w in self._warnings(r)))
        self.assertFalse(any(d[1] == 'WELL DONE' for d in fake.deltas))

    def test_needs_data_option_is_a_warning(self):
        ModifierOption.objects.create(
            group=self.roll, name_en='Beef', kind='type', pos_mods_string='(B) BEEF')  # no variant, no deltas
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertTrue(any('Beef' in w and 'not published' in w for w in self._warnings(r)))

    def test_deltas_are_pruned_before_re_push(self):
        fake = FakeClient()
        with _patch(fake):
            self._publish()
        self.assertIn(('Meat Arayes', 'GARLIC SAUCE'), fake.pruned)

    def test_dish_with_no_modifiers_pushes_nothing(self):
        DishModifierGroup.objects.filter(dish=self.dish).delete()
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertEqual(fake.mappings, [])
        self.assertEqual(fake.deltas, [])

    def test_unpublished_variant_is_a_warning(self):
        self.chicken.inventory_recipe_id = ''
        self.chicken.save()
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertTrue(any('not published' in w for w in self._warnings(r)))
        self.assertEqual(len(fake.mappings), 1)   # base only

    def test_unknown_delta_sku_is_a_warning(self):
        self.opt_sauce.deltas.update(item_sku='NOPE')
        fake = FakeClient()
        with _patch(fake):
            r = self._publish()
        self.assertEqual(fake.deltas, [])
        self.assertTrue(any('NOPE' in w for w in self._warnings(r)))
