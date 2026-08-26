"""
End-to-end: create / update / recalculate a dish recipe through the API and
check the stored cost + breakdown match the engine.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import DishRecipe, MenuCategory, Section
from .support import TABBOULEH_LINES, fake_inventory_items, make_tabbouleh_items, make_units


class DishRecipeApiTests(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.category = MenuCategory.objects.create(name='Salad')
        user = get_user_model().objects.create_superuser('chef', password='x')
        # JSON only — the browsable-API renderer trips a Py3.14 bug in the test
        # client's template-capture instrumentation.
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(user)

    def _payload(self, **over):
        lines = [
            {**l, 'unit': str(self.units[l['unit']].id), 'item_name_snapshot': l['item_sku']}
            for l in TABBOULEH_LINES
        ]
        p = {
            'name_en': 'Tabbouleh Salad', 'name_ar': 'سلطة التبولة',
            'recipe_code': '1076.9', 'revision': 'Rev.01',
            'branch': 'Dine', 'category': str(self.category.id), 'section': str(self.section.id),
            'selling_price': '2.900', 'rating': '8', 'rating_status': 'attention',
            'prep_time_minutes': 3, 'expected_waste_pct': '1.00', 'include_labor_cost': True,
            'ingredients': lines,
            'steps': [{'instruction': 'Mix.'}],
        }
        p.update(over)
        return p

    def test_create_stores_full_breakdown(self):
        with fake_inventory_items([]):
            resp = self.client.post('/api/cookbook/dish-recipes/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

        recipe = DishRecipe.objects.get(recipe_code='1076.9')
        self.assertAlmostEqual(float(recipe.cost), 0.752, places=3)
        self.assertGreater(float(recipe.labor_cost), 0)

        bd = recipe.cost_breakdown
        self.assertEqual(bd['items'], '0.676')
        self.assertEqual(bd['per_serving'], '0.752')
        self.assertEqual(bd['food_cost_pct'], '25.92')
        self.assertEqual(len(bd['lines']), 9)
        self.assertTrue(all(l['status'] == 'ok' for l in bd['lines']), bd['lines'])
        self.assertEqual(bd['issues'], [])
        self.assertEqual(len(bd['scenarios']), 4)
        self.assertNotIn('_warnings', resp.data)

    def test_unknown_sku_is_a_warning_not_a_failure(self):
        payload = self._payload()
        payload['ingredients'][0]['item_sku'] = 'GHOST'
        with fake_inventory_items([]):
            resp = self.client.post('/api/cookbook/dish-recipes/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertIn('_warnings', resp.data)
        self.assertTrue(any('GHOST' in w for w in resp.data['_warnings']))

    def test_recalculate_endpoint(self):
        with fake_inventory_items([]):
            create = self.client.post('/api/cookbook/dish-recipes/', self._payload(), format='json')
            rid = create.data['id']
            resp = self.client.post(f'/api/cookbook/dish-recipes/{rid}/recalculate/')
        self.assertEqual(resp.status_code, 200)
        self.assertAlmostEqual(float(resp.data['cost']), 0.752, places=3)

    def test_edit_recomputes_cost(self):
        with fake_inventory_items([]):
            create = self.client.post('/api/cookbook/dish-recipes/', self._payload(), format='json')
            rid = create.data['id']
            payload = self._payload()
            for l in payload['ingredients']:
                l['quantity'] = str(Decimal(l['quantity']) / 2)
            resp = self.client.patch(f'/api/cookbook/dish-recipes/{rid}/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertLess(float(resp.data['cost']), 0.752)

    def test_ingredient_edit_creates_a_new_version(self):
        with fake_inventory_items([]):
            create = self.client.post('/api/cookbook/dish-recipes/', self._payload(), format='json')
            rid = create.data['id']

            # a no-op save must NOT create a version
            self.client.patch(f'/api/cookbook/dish-recipes/{rid}/', self._payload(), format='json')
            self.assertEqual(DishRecipe.objects.count(), 1)

            # changing a quantity does
            payload = self._payload()
            payload['ingredients'][0]['quantity'] = '80'
            resp = self.client.patch(f'/api/cookbook/dish-recipes/{rid}/', payload, format='json')

        self.assertEqual(resp.data['version'], 2)
        self.assertEqual(DishRecipe.objects.count(), 2)
        live = DishRecipe.objects.get(pk=rid)
        archived = DishRecipe.objects.exclude(pk=rid).get()
        self.assertTrue(live.is_current)
        self.assertFalse(archived.is_current)
        self.assertEqual(archived.version, 1)
        self.assertEqual(archived.ingredients.count(), 9)   # full snapshot kept
        # list endpoint hides the archived version
        listing = self.client.get('/api/cookbook/dish-recipes/')
        self.assertEqual(listing.data['count'], 1)
