"""GET /api/cookbook/branch-food-cost/ — the per-branch total on the Dish Recipes list."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import Branch, DishRecipe

User = get_user_model()
URL = '/api/cookbook/branch-food-cost/'


def make_dish(name, code, *, cost, price, branch, is_current=True):
    return DishRecipe.objects.create(
        name_en=name, recipe_code=code, branch_ref=branch, is_current=is_current,
        cost=Decimal(cost), selling_price=Decimal(price) if price is not None else None,
    )


def api(user):
    c = APIClient(HTTP_ACCEPT='application/json')
    c.force_authenticate(user)
    return c


def scoped_user(username, role_name, branches):
    u = User.objects.create_user(username, password='x')
    u.profile.role = Role.objects.get(name=role_name)
    u.profile.scope_overridden = True
    u.profile.save()
    u.profile.branches.set(branches)
    return u


class BranchFoodCostApiTests(APITestCase):
    def setUp(self):
        self.dine = Branch.objects.create(name_en='Dine', sort_order=1)
        self.luma = Branch.objects.create(name_en='Luma', sort_order=2)
        Branch.objects.create(name_en='Empty', sort_order=3)
        make_dish('Tikka', 'D1', cost='3.000', price='6.000', branch=self.dine)
        make_dish('Tabbouleh', 'D2', cost='1.000', price='4.000', branch=self.dine)
        make_dish('No price', 'D3', cost='2.000', price=None, branch=self.dine)
        make_dish('Not costed', 'D4', cost='0', price='5.000', branch=self.dine)
        make_dish('Old version', 'D5', cost='9.000', price='1.000', branch=self.dine, is_current=False)
        make_dish('Fattoush', 'L1', cost='2.000', price='4.000', branch=self.luma)
        self.admin = User.objects.create_superuser('boss', password='x')

    def test_weighted_total_per_branch_skips_gaps(self):
        resp = api(self.admin).get(URL)
        self.assertEqual(resp.status_code, 200)
        rows = {r['name_en']: r for r in resp.data['branches']}
        self.assertEqual(list(rows), ['Dine', 'Luma'])   # branch order; no row for a branch without dishes
        dine = rows['Dine']
        # (3 + 1) / (6 + 4) — not the 37.5% mean of 50% and 25%
        self.assertEqual(dine['food_cost_pct'], '40.00')
        self.assertEqual(dine['total_cost'], '4.000')
        self.assertEqual(dine['total_price'], '10.000')
        self.assertEqual((dine['dishes'], dine['priced'], dine['unpriced'], dine['uncosted']), (4, 2, 1, 1))
        self.assertEqual(rows['Luma']['food_cost_pct'], '50.00')
        self.assertEqual(resp.data['target_pct'], '30')

    def test_branch_with_nothing_priced_has_no_pct(self):
        DishRecipe.objects.filter(branch_ref=self.luma).update(selling_price=None)
        rows = {r['name_en']: r for r in api(self.admin).get(URL).data['branches']}
        self.assertIsNone(rows['Luma']['food_cost_pct'])
        self.assertEqual(rows['Luma']['unpriced'], 1)

    def test_scoped_user_sees_only_their_branch(self):
        u = scoped_user('cc', 'Cost Controller', [self.luma])
        resp = api(u).get(URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([r['name_en'] for r in resp.data['branches']], ['Luma'])

    def test_requires_costing_view(self):
        u = scoped_user('staff', 'Branch Staff', [self.dine])   # dish.view, no costing.view
        self.assertEqual(api(u).get(URL).status_code, 403)
