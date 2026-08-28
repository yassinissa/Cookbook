"""
Publish a Cookbook recipe to inventory-platform: SKU/unit resolution,
POST-then-PATCH, warnings vs hard failures, capability gate.

The inventory-platform client is faked — nothing here touches the network.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeIngredient, PrepKitchen, ProductionRecipe,
    ProductionRecipeIngredient, Section, UnitScale,
)
from apps.integrations.inventory_client import InventoryAPIError

User = get_user_model()


class FakeClient:
    """Stand-in for InventoryClient. Records the last recipe payload."""
    def __init__(self, *, items=None, units=None, fail=False):
        self._items = items if items is not None else [
            {'id': 'itm-1', 'sku': 'B41'}, {'id': 'itm-2', 'sku': 'B2050'},
            {'id': 'itm-out', 'sku': 'PR-TOUM'},
        ]
        self._units = units if units is not None else [
            {'id': 'u-g', 'code': 'g'}, {'id': 'u-ml', 'code': 'ml'}, {'id': 'u-kg', 'code': 'Kg'},
        ]
        self.fail = fail
        self.calls = []

    def get_items(self):
        return self._items

    def get_units(self):
        return self._units

    def _record(self, verb, payload):
        self.calls.append((verb, payload))
        if self.fail:
            raise InventoryAPIError('POST /recipes/dish/ failed: 400 {"name_en": ["exists"]}')
        return {'id': 'inv-999'}

    def create_dish_recipe(self, payload):        return self._record('create_dish', payload)
    def update_dish_recipe(self, rid, payload):   return self._record(f'update_dish:{rid}', payload)
    def create_production_recipe(self, payload):  return self._record('create_prod', payload)
    def update_production_recipe(self, rid, p):   return self._record(f'update_prod:{rid}', p)


def patch_client(fake):
    return mock.patch('apps.cookbook.publishing.InventoryClient', return_value=fake)


class DishPublishTests(APITestCase):
    def setUp(self):
        self.g = UnitScale.objects.create(code='g', description='g', dimension='mass', factor_to_canonical=1)
        self.ml = UnitScale.objects.create(code='ml', description='ml', dimension='volume', factor_to_canonical=1)
        self.section = Section.objects.create(name='Cold', avg_monthly_salary=Decimal('285'))
        self.branch = Branch.objects.create(name_en='Salmiya', code='SLM', sort_order=1)
        self.dish = DishRecipe.objects.create(
            name_en='Toum Dip', recipe_code='D1', branch_ref=self.branch, section=self.section,
            selling_price=Decimal('2.500'), cost=Decimal('0.8'))
        DishRecipeIngredient.objects.create(recipe=self.dish, order=1, item_sku='B41',
                                            item_name_snapshot='Garlic', quantity=Decimal('500'), unit=self.g)
        DishRecipeIngredient.objects.create(recipe=self.dish, order=2, item_sku='B2050',
                                            item_name_snapshot='Lemon', quantity=Decimal('180'), unit=self.ml)

        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_first_publish_posts_and_stores_the_id(self):
        fake = FakeClient()
        with patch_client(fake):
            r = self.client.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['inventory_recipe_id'], 'inv-999')
        self.assertIsNotNone(r.data['published_at'])
        self.assertEqual(r.data['_publish']['warnings'], [])

        verb, payload = fake.calls[0]
        self.assertEqual(verb, 'create_dish')
        self.assertEqual(payload['name_en'], 'Toum Dip')
        self.assertEqual(payload['pos_item_name'], 'Toum Dip')
        self.assertEqual(payload['ingredients'], [
            {'item': 'itm-1', 'quantity': '500.000', 'unit': 'u-g'},
            {'item': 'itm-2', 'quantity': '180.000', 'unit': 'u-ml'},
        ])
        self.dish.refresh_from_db()
        self.assertEqual(self.dish.inventory_recipe_id, 'inv-999')
        self.assertEqual(self.dish.publish_error, '')
        self.assertTrue(self.dish.activity_log.filter(action_type='published').exists())

    def test_second_publish_patches(self):
        self.dish.inventory_recipe_id = 'inv-42'
        self.dish.save(update_fields=['inventory_recipe_id'])
        fake = FakeClient()
        with patch_client(fake):
            r = self.client.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(fake.calls[0][0], 'update_dish:inv-42')

    def test_unknown_sku_is_a_warning_not_a_failure(self):
        DishRecipeIngredient.objects.create(recipe=self.dish, order=3, item_sku='GHOST',
                                            item_name_snapshot='Mystery', quantity=Decimal('1'), unit=self.g)
        fake = FakeClient()
        with patch_client(fake):
            r = self.client.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any('GHOST' in w for w in r.data['_publish']['warnings']))
        self.assertEqual(len(fake.calls[0][1]['ingredients']), 2)   # ghost line dropped

    def test_platform_rejection_is_502_and_records_the_error(self):
        fake = FakeClient(fail=True)
        with patch_client(fake):
            r = self.client.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')
        self.assertEqual(r.status_code, 502)
        self.dish.refresh_from_db()
        self.assertIn('exists', self.dish.publish_error)
        self.assertEqual(self.dish.inventory_recipe_id, '')

    def test_publish_needs_the_capability(self):
        cook = User.objects.create_user('cook', password='x')
        p = cook.profile
        p.role = Role.objects.get(name='Restaurant Cook')
        p.scope_overridden = True
        p.save()
        p.branches.set([self.branch])
        p.extra_capabilities.set(Capability.objects.filter(code='dish.view'))
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(cook)
        with patch_client(FakeClient()):
            r = c.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')
        self.assertEqual(r.status_code, 403)

    def test_publish_stale_flag_after_edit(self):
        from datetime import timedelta
        from django.utils import timezone

        fake = FakeClient()
        with patch_client(fake):
            self.client.post(f'/api/cookbook/dish-recipes/{self.dish.id}/publish/')
        detail = self.client.get(f'/api/cookbook/dish-recipes/{self.dish.id}/').data
        self.assertFalse(detail['publish_stale'])   # fresh publish

        # simulate a publish an hour ago, then an edit now
        DishRecipe.objects.filter(pk=self.dish.pk).update(
            published_at=timezone.now() - timedelta(hours=1))
        self.dish.refresh_from_db()
        self.dish.notes = 'tweaked'
        self.dish.save()
        detail = self.client.get(f'/api/cookbook/dish-recipes/{self.dish.id}/').data
        self.assertTrue(detail['publish_stale'])


class ProductionPublishTests(APITestCase):
    def setUp(self):
        self.g = UnitScale.objects.create(code='g', description='g', dimension='mass', factor_to_canonical=1)
        self.kg = UnitScale.objects.create(code='Kg', description='Kg', dimension='mass', factor_to_canonical=1000)
        self.section = Section.objects.create(name='Sauce', avg_monthly_salary=Decimal('300'))
        self.pk = PrepKitchen.objects.get(name_en='Sauce')
        self.pk.inventory_store_id = 'store-77'
        self.pk.save(update_fields=['inventory_store_id'])

        self.recipe = ProductionRecipe.objects.create(
            name_en='Toum', recipe_code='P1', prep_kitchen_ref=self.pk, section=self.section,
            output_item_sku='PR-TOUM', output_qty=Decimal('2.400'), output_unit=self.kg, cost=Decimal('0.5'))
        ProductionRecipeIngredient.objects.create(recipe=self.recipe, order=1, item_sku='B41',
                                                  item_name_snapshot='Garlic', quantity=Decimal('500'), unit=self.g)

        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_publish_resolves_prep_kitchen_and_output_item(self):
        fake = FakeClient()
        with patch_client(fake):
            r = self.client.post(f'/api/cookbook/production-recipes/{self.recipe.id}/publish/')
        self.assertEqual(r.status_code, 200, r.data)
        verb, payload = fake.calls[0]
        self.assertEqual(verb, 'create_prod')
        self.assertEqual(payload['prep_kitchen'], 'store-77')
        self.assertEqual(payload['output_item'], 'itm-out')
        self.assertEqual(payload['output_qty'], '2.400')

    def test_missing_output_item_is_502(self):
        self.recipe.output_item_sku = 'PR-NOTREAL'
        self.recipe.save(update_fields=['output_item_sku'])
        with patch_client(FakeClient()):
            r = self.client.post(f'/api/cookbook/production-recipes/{self.recipe.id}/publish/')
        self.assertEqual(r.status_code, 502)
        self.assertIn('PR-NOTREAL', r.data['detail'])

    def test_unlinked_prep_kitchen_is_502(self):
        self.pk.inventory_store_id = ''
        self.pk.save(update_fields=['inventory_store_id'])
        with patch_client(FakeClient()):
            r = self.client.post(f'/api/cookbook/production-recipes/{self.recipe.id}/publish/')
        self.assertEqual(r.status_code, 502)
        self.assertIn('prep kitchen', r.data['detail'].lower())
