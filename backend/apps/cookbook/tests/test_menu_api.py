"""
Stage 6 — per-branch menus: build from the branch's dishes, override a menu
price, freeze a snapshot, and read the trend series back.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import Branch, DishRecipe, Menu, MenuCategory, Section
from .support import TABBOULEH_LINES, fake_inventory_items, make_tabbouleh_items, make_units


class MenuApiTests(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.category = MenuCategory.objects.create(name='Salad', sort_order=1, menu_title_ar='سلطات')
        self.branch = Branch.objects.create(name_en='Dine', name_ar='داين', code='DINE', sort_order=1)
        self.menu = Menu.objects.create(branch=self.branch, name='Dine Menu', is_active=True)

        user = get_user_model().objects.create_user('chef', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(user)

        self._make_dish('Tabbouleh', '1076.9', '2.900')
        self._make_dish('Fattoush', '1077.0', '3.100')

    def _make_dish(self, name, code, price):
        lines = [
            {**l, 'unit': str(self.units[l['unit']].id), 'item_name_snapshot': l['item_sku']}
            for l in TABBOULEH_LINES
        ]
        payload = {
            'name_en': name, 'recipe_code': code,
            'branch': 'Dine', 'branch_ref': str(self.branch.id),
            'category': str(self.category.id), 'section': str(self.section.id),
            'selling_price': price, 'prep_time_minutes': 3, 'expected_waste_pct': '1.00',
            'include_labor_cost': True, 'ingredients': lines, 'steps': [{'instruction': 'Mix.'}],
        }
        with fake_inventory_items([]):
            resp = self.client.post('/api/cookbook/dish-recipes/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_build_populates_from_branch_dishes(self):
        resp = self.client.post(f'/api/cookbook/menus/{self.menu.id}/build/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['_added'], 2)
        self.assertEqual(len(resp.data['lines']), 2)

        by_name = {l['dish_name']: l for l in resp.data['lines']}
        self.assertEqual(set(by_name), {'Tabbouleh', 'Fattoush'})
        self.assertEqual(by_name['Tabbouleh']['category_ar'], 'سلطات')
        self.assertIsNotNone(by_name['Tabbouleh']['food_cost_pct'])
        self.assertEqual(Decimal(by_name['Tabbouleh']['effective_price']), Decimal('2.900'))
        self.assertEqual(Decimal(by_name['Fattoush']['effective_price']), Decimal('3.100'))

        # a second build adds nothing
        again = self.client.post(f'/api/cookbook/menus/{self.menu.id}/build/')
        self.assertEqual(again.data['_added'], 0)
        self.assertEqual(len(again.data['lines']), 2)

    def test_menu_price_override_changes_food_cost_pct(self):
        self.client.post(f'/api/cookbook/menus/{self.menu.id}/build/')
        line = self.menu.lines.first()
        before = self.client.get(f'/api/cookbook/menus/{self.menu.id}/').data['lines']
        before_fcp = next(l for l in before if l['id'] == str(line.id))['food_cost_pct']

        resp = self.client.patch(
            f'/api/cookbook/menu-lines/{line.id}/', {'menu_price': '99.000'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Decimal(resp.data['effective_price']), Decimal('99.000'))
        self.assertLess(Decimal(resp.data['food_cost_pct']), Decimal(before_fcp))

    def test_snapshot_then_trends(self):
        self.client.post(f'/api/cookbook/menus/{self.menu.id}/build/')

        snap = self.client.post(
            f'/api/cookbook/menus/{self.menu.id}/snapshot/', {'label': 'baseline'}, format='json')
        self.assertEqual(snap.status_code, 201, snap.data)
        self.assertEqual(len(snap.data['lines']), 2)

        self.menu.refresh_from_db()
        self.assertIsNotNone(self.menu.last_snapshot_at)

        trends = self.client.get(f'/api/cookbook/menus/{self.menu.id}/trends/')
        self.assertEqual(trends.status_code, 200)
        self.assertEqual(len(trends.data['points']), 1)
        point = trends.data['points'][0]
        self.assertEqual(point['label'], 'baseline')
        self.assertEqual(point['dishes'], 2)
        self.assertIsNotNone(point['avg_food_cost_pct'])

    def test_add_rejects_duplicates_and_remove_works(self):
        self.client.post(f'/api/cookbook/menus/{self.menu.id}/build/')
        line = self.menu.lines.first()
        dish_id = line.dish_id

        # adding a dish already on the menu is a 400
        dup = self.client.post(
            f'/api/cookbook/menus/{self.menu.id}/lines/', {'dish': str(dish_id)}, format='json')
        self.assertEqual(dup.status_code, 400)

        # remove it, then it can be re-added
        rm = self.client.delete(f'/api/cookbook/menu-lines/{line.id}/')
        self.assertEqual(rm.status_code, 204)
        self.assertEqual(self.menu.lines.count(), 1)

        readd = self.client.post(
            f'/api/cookbook/menus/{self.menu.id}/lines/', {'dish': str(dish_id)}, format='json')
        self.assertEqual(readd.status_code, 201, readd.data)
        self.assertEqual(self.menu.lines.count(), 2)
