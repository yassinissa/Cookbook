"""GET /api/cookbook/dashboard/ — the landing-screen aggregate."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import Branch, MenuCategory, Section
from .support import TABBOULEH_LINES, fake_inventory_items, make_tabbouleh_items, make_units


class DashboardApiTests(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.category = MenuCategory.objects.create(name='Salad', menu_title_ar='سلطات')
        self.branch = Branch.objects.create(name_en='Dine', name_ar='داين', code='DINE', sort_order=1)

        user = get_user_model().objects.create_superuser('chef', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(user)

    def _make_dish(self, name, code, price, **over):
        lines = [
            {**l, 'unit': str(self.units[l['unit']].id), 'item_name_snapshot': l['item_sku']}
            for l in TABBOULEH_LINES
        ]
        payload = {
            'name_en': name, 'recipe_code': code, 'branch': 'Dine',
            'branch_ref': str(self.branch.id), 'category': str(self.category.id),
            'section': str(self.section.id), 'selling_price': price,
            'prep_time_minutes': 3, 'expected_waste_pct': '1.00', 'include_labor_cost': True,
            'ingredients': lines, 'steps': [{'instruction': 'Mix.'}],
        }
        payload.update(over)
        with fake_inventory_items([]):
            resp = self.client.post('/api/cookbook/dish-recipes/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_empty_dashboard_is_well_formed(self):
        resp = self.client.get('/api/cookbook/dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['totals']['dishes'], 0)
        self.assertIsNone(resp.data['food_cost']['avg_pct'])
        self.assertEqual(resp.data['attention']['items'], [])
        self.assertEqual(len(resp.data['branch_health']), 1)  # the one branch
        self.assertEqual(resp.data['branch_health'][0]['dishes'], 0)

    def test_dashboard_reports_totals_attention_and_over_target(self):
        # healthy dish (~26% food cost at 2.900)
        self._make_dish('Tabbouleh', '1076.9', '2.900')
        # a very cheap price => food cost well over 30%, and flagged for QA
        self._make_dish('Fattoush', '1077.0', '1.000', rating_status='fix')

        resp = self.client.get('/api/cookbook/dashboard/')
        self.assertEqual(resp.status_code, 200, resp.data)

        self.assertEqual(resp.data['totals']['dishes'], 2)
        self.assertEqual(resp.data['totals']['branches'], 1)
        self.assertIsNotNone(resp.data['food_cost']['avg_pct'])
        self.assertEqual(resp.data['food_cost']['over_target'], 1)

        names_over = {row['name_en'] for row in resp.data['over_target']}
        self.assertIn('Fattoush', names_over)
        self.assertNotIn('Tabbouleh', names_over)

        attention = {i['name_en']: i['reasons'] for i in resp.data['attention']['items']}
        self.assertIn('Fattoush', attention)
        self.assertIn('rating:fix', attention['Fattoush'])
        self.assertIn('over_target', attention['Fattoush'])

        health = resp.data['branch_health'][0]
        self.assertEqual(health['name_en'], 'Dine')
        self.assertEqual(health['dishes'], 2)
        self.assertEqual(health['over_target'], 1)

    def test_recent_activity_lists_creates(self):
        self._make_dish('Tabbouleh', '1076.9', '2.900')
        resp = self.client.get('/api/cookbook/dashboard/')
        actions = [a['action'] for a in resp.data['recent_activity']]
        self.assertIn('created', actions)
        self.assertEqual(resp.data['recent_activity'][0]['recipe_name'], 'Tabbouleh')
