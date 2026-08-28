"""
End-to-end for production (prep-kitchen) recipes: create / recalculate / version
through the API, plus prep-kitchen scope enforcement on the write path.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import PrepKitchen, ProductionRecipe, Section
from .support import fake_inventory_items, make_tabbouleh_items, make_units

User = get_user_model()


class ProductionRecipeApiTests(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Sauce', avg_monthly_salary=Decimal('300.00'))
        self.sauce = PrepKitchen.objects.get(name_en='Sauce')
        self.bread = PrepKitchen.objects.get(name_en='Bread')

        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def _payload(self, **over):
        lines = [
            {'item_sku': 'B72', 'item_name_snapshot': 'Parsley', 'quantity': '500',
             'unit': str(self.units['g'].id)},
            {'item_sku': 'B2050', 'item_name_snapshot': 'Lemon juice', 'quantity': '180',
             'unit': str(self.units['ml'].id)},
        ]
        p = {
            'name_en': 'Green Sauce Base', 'name_ar': 'صلصة خضراء',
            'recipe_code': 'P-500', 'revision': 'Rev.01',
            'prep_kitchen_ref': str(self.sauce.id), 'section': str(self.section.id),
            'output_item_sku': 'PR-GREENSAUCE', 'output_qty': '2.000',
            'output_unit': str(self.units['Kg'].id),
            'prep_time_minutes': 20, 'expected_waste_pct': '3.00',
            'include_labor_cost': False,
            'ingredients': lines,
            'steps': [{'instruction': 'Blend smooth.'}],
        }
        p.update(over)
        return p

    def test_create_stores_breakdown_and_cost_per_unit(self):
        with fake_inventory_items([]):
            resp = self.client.post('/api/cookbook/production-recipes/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

        recipe = ProductionRecipe.objects.get(recipe_code='P-500')
        self.assertGreater(float(recipe.cost), 0)

        bd = recipe.cost_breakdown
        self.assertEqual(bd['per_serving'], str(recipe.cost))
        self.assertEqual(len(bd['lines']), 2)
        # labour is excluded per the include_labor_cost=False flag
        self.assertEqual(bd['labor'], '0.000')
        # cost_per_unit = per-batch cost / output_qty
        expected_per_unit = round(float(recipe.cost) / 2.0, 3)
        self.assertAlmostEqual(float(resp.data['cost_per_unit']), expected_per_unit, places=3)

    def test_recalculate_endpoint(self):
        with fake_inventory_items([]):
            create = self.client.post('/api/cookbook/production-recipes/', self._payload(), format='json')
            rid = create.data['id']
            resp = self.client.post(f'/api/cookbook/production-recipes/{rid}/recalculate/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['cost'], create.data['cost'])

    def test_quantity_edit_creates_a_new_version(self):
        with fake_inventory_items([]):
            create = self.client.post('/api/cookbook/production-recipes/', self._payload(), format='json')
            rid = create.data['id']
            payload = self._payload()
            payload['ingredients'][0]['quantity'] = '250'
            resp = self.client.patch(
                f'/api/cookbook/production-recipes/{rid}/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['version'], 2)
        self.assertEqual(ProductionRecipe.objects.count(), 2)
        listing = self.client.get('/api/cookbook/production-recipes/')
        self.assertEqual(listing.data['count'], 1)


class ProductionScopeTests(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Sauce', avg_monthly_salary=Decimal('300.00'))
        self.sauce = PrepKitchen.objects.get(name_en='Sauce')
        self.bread = PrepKitchen.objects.get(name_en='Bread')
        self.admin = User.objects.create_superuser('boss', password='x')

        self.sauce_recipe = ProductionRecipe.objects.create(
            name_en='Sauce base', recipe_code='S1', prep_kitchen_ref=self.sauce,
            section=self.section, output_item_sku='PR-S1', output_qty=Decimal('1.000'),
            output_unit=self.units['Kg'], cost=Decimal('0.500'),
        )
        self.bread_recipe = ProductionRecipe.objects.create(
            name_en='Dough', recipe_code='B1', prep_kitchen_ref=self.bread,
            section=self.section, output_item_sku='PR-B1', output_qty=Decimal('1.000'),
            output_unit=self.units['Kg'], cost=Decimal('0.400'),
        )

    def _prep_cook(self, kitchens):
        u = User.objects.create_user(f'u{User.objects.count()}', password='x')
        p = u.profile
        p.role = Role.objects.get(name='Prep Cook')
        p.scope_overridden = True
        p.save()
        p.prep_kitchens.set(kitchens)
        return u

    def api(self, user):
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(user)
        return c

    def test_list_and_retrieve_are_scoped(self):
        c = self.api(self._prep_cook([self.sauce]))
        listing = c.get('/api/cookbook/production-recipes/')
        self.assertEqual({r['name_en'] for r in listing.data['results']}, {'Sauce base'})
        self.assertEqual(c.get(f'/api/cookbook/production-recipes/{self.bread_recipe.id}/').status_code, 404)

    def test_create_out_of_scope_prep_kitchen_is_rejected(self):
        c = self.api(self._prep_cook([self.sauce]))
        payload = {
            'name_en': 'Sneaky dough', 'recipe_code': 'X1',
            'prep_kitchen_ref': str(self.bread.id), 'section': str(self.section.id),
            'output_item_sku': 'PR-X1', 'output_qty': '1.000',
            'output_unit': str(self.units['Kg'].id),
            'ingredients': [], 'steps': [],
        }
        with fake_inventory_items([]):
            resp = c.post('/api/cookbook/production-recipes/', payload, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('prep_kitchen_ref', resp.data)

    def test_create_in_own_prep_kitchen_succeeds(self):
        c = self.api(self._prep_cook([self.sauce]))
        payload = {
            'name_en': 'Aioli', 'recipe_code': 'A1',
            'prep_kitchen_ref': str(self.sauce.id), 'section': str(self.section.id),
            'output_item_sku': 'PR-A1', 'output_qty': '1.500',
            'output_unit': str(self.units['Kg'].id),
            'ingredients': [], 'steps': [],
        }
        with fake_inventory_items([]):
            resp = c.post('/api/cookbook/production-recipes/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
