"""
Per-recipe version history + diff:
  GET /api/cookbook/dish-recipes/<id>/versions/
  GET /api/cookbook/dish-recipes/<id>/diff/?a=&b=
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import DishRecipe, MenuCategory, Section
from .support import TABBOULEH_LINES, fake_inventory_items, make_tabbouleh_items, make_units


class VersioningApiTests(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.category = MenuCategory.objects.create(name='Salad')
        user = get_user_model().objects.create_superuser('chef', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(user)

    def _payload(self, **over):
        lines = [
            {**l, 'unit': str(self.units[l['unit']].id), 'item_name_snapshot': l['item_sku']}
            for l in TABBOULEH_LINES
        ]
        p = {
            'name_en': 'Tabbouleh Salad', 'name_ar': 'سلطة التبولة',
            'recipe_code': '1076.9', 'revision': 'Rev.01', 'branch': 'Dine',
            'category': str(self.category.id), 'section': str(self.section.id),
            'selling_price': '2.900', 'prep_time_minutes': 3, 'expected_waste_pct': '1.00',
            'include_labor_cost': True, 'ingredients': lines, 'steps': [{'instruction': 'Mix.'}],
        }
        p.update(over)
        return p

    def _create(self):
        with fake_inventory_items([]):
            resp = self.client.post('/api/cookbook/dish-recipes/', self._payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data['id']

    def test_single_version_lists_one_entry(self):
        rid = self._create()
        resp = self.client.get(f'/api/cookbook/dish-recipes/{rid}/versions/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(resp.data['versions']), 1)
        v = resp.data['versions'][0]
        self.assertEqual(v['version'], 1)
        self.assertTrue(v['is_current'])
        self.assertIsNone(v['changes_from_previous'])

    def test_diff_needs_two_versions(self):
        rid = self._create()
        resp = self.client.get(f'/api/cookbook/dish-recipes/{rid}/diff/')
        self.assertEqual(resp.status_code, 400)

    def test_edit_then_versions_and_diff(self):
        rid = self._create()
        payload = self._payload(name_en='Tabbouleh Salad (Large)', selling_price='3.500')
        payload['ingredients'][0]['quantity'] = '90'
        payload['steps'] = [{'instruction': 'Mix.'}, {'instruction': 'Plate and serve chilled.'}]
        with fake_inventory_items([]):
            resp = self.client.patch(f'/api/cookbook/dish-recipes/{rid}/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['version'], 2)

        versions = self.client.get(f'/api/cookbook/dish-recipes/{rid}/versions/').data['versions']
        self.assertEqual([v['version'] for v in versions], [1, 2])
        self.assertTrue(versions[1]['is_current'])
        summary = versions[1]['changes_from_previous']
        self.assertIn('name_en', summary['fields_changed'])
        self.assertIn('selling_price', summary['fields_changed'])
        self.assertEqual(summary['ingredients_changed'], 1)
        self.assertEqual(summary['steps_added'], 1)

        diff = self.client.get(f'/api/cookbook/dish-recipes/{rid}/diff/').data
        self.assertEqual(diff['from']['version'], 1)
        self.assertEqual(diff['to']['version'], 2)
        changed_fields = {f['field']: f for f in diff['fields']}
        self.assertEqual(changed_fields['name_en']['from'], 'Tabbouleh Salad')
        self.assertEqual(changed_fields['name_en']['to'], 'Tabbouleh Salad (Large)')
        self.assertEqual(len(diff['ingredients']['changed']), 1)
        self.assertEqual(diff['steps']['count_from'], 1)
        self.assertEqual(diff['steps']['count_to'], 2)

    def test_archived_version_is_retrievable_and_diffable_by_its_own_id(self):
        rid = self._create()
        payload = self._payload()
        payload['ingredients'][0]['quantity'] = '90'
        with fake_inventory_items([]):
            self.client.patch(f'/api/cookbook/dish-recipes/{rid}/', payload, format='json')
        archived = DishRecipe.objects.exclude(pk=rid).get()

        # versions/ works when asked via the archived row too
        resp = self.client.get(f'/api/cookbook/dish-recipes/{archived.id}/versions/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['versions']), 2)

        diff = self.client.get(
            f'/api/cookbook/dish-recipes/{rid}/diff/?a={archived.id}&b={rid}').data
        self.assertEqual(diff['from']['version'], 1)
        self.assertEqual(diff['to']['version'], 2)
