"""
Standalone QA/QC standards API: list shows every current dish (with a gap
flag), upsert doesn't version the recipe, approve stamps the sign-off,
and the scope / capability gates hold.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import (
    Approver, Branch, DishRecipe, DishStandard, MenuCategory, Section,
)

User = get_user_model()


def make_dish(name, code, branch=None, section=None, category=None):
    return DishRecipe.objects.create(
        name_en=name, recipe_code=code,
        branch=branch.name_en if branch else '', branch_ref=branch,
        section=section, category=category,
        selling_price=Decimal('3.000'), cost=Decimal('0.800'),
        cost_breakdown={'food_cost_pct': '26.67', 'per_serving': '0.800'},
    )


class StandardsApiTests(APITestCase):
    def setUp(self):
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.category = MenuCategory.objects.create(name='Salad')
        self.qa = Approver.objects.create(name='Lina Aoun (QA)')

        self.with_std = make_dish('Tabbouleh', 'T1', section=self.section, category=self.category)
        DishStandard.objects.create(
            dish_recipe=self.with_std, portion_weight_g=Decimal('180'),
            serving_temp_c=Decimal('6'), primary_flavor='Fresh, herbal',
            sweetness_target=Decimal('2'), sweetness_tolerance=Decimal('1'),
        )
        self.no_std = make_dish('Muhammara', 'M1', section=self.section, category=self.category)

        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_list_is_one_row_per_dish_with_gap_flag(self):
        resp = self.client.get('/api/cookbook/dish-standards/')
        self.assertEqual(resp.status_code, 200)
        rows = {r['name_en']: r for r in resp.data['results']}
        self.assertEqual(set(rows), {'Tabbouleh', 'Muhammara'})
        self.assertTrue(rows['Tabbouleh']['has_standard'])
        self.assertFalse(rows['Muhammara']['has_standard'])
        self.assertEqual(rows['Muhammara']['spec_coverage'], {'filled': 0, 'total': 5})
        self.assertGreaterEqual(rows['Tabbouleh']['spec_coverage']['filled'], 2)
        self.assertEqual(rows['Tabbouleh']['taste_axis_count'], 1)
        # has a standard but never approved -> needs review
        self.assertTrue(rows['Tabbouleh']['needs_review'])
        self.assertFalse(rows['Tabbouleh']['is_approved'])

    def test_retrieve_returns_full_standard_or_null(self):
        d = self.client.get(f'/api/cookbook/dish-standards/{self.with_std.id}/')
        self.assertEqual(d.status_code, 200)
        self.assertEqual(d.data['standard']['primary_flavor'], 'Fresh, herbal')

        empty = self.client.get(f'/api/cookbook/dish-standards/{self.no_std.id}/')
        self.assertIsNone(empty.data['standard'])

    def test_upsert_creates_then_updates_without_versioning_the_recipe(self):
        before_version = self.no_std.version
        create = self.client.patch(
            f'/api/cookbook/dish-standards/{self.no_std.id}/',
            {'portion_weight_g': '250', 'aroma': 'Smoky, roasted pepper',
             'serving_temp_c': '', 'holding_time_minutes': ''},
            format='json',
        )
        self.assertEqual(create.status_code, 201, create.data)
        self.no_std.refresh_from_db()
        self.assertEqual(self.no_std.version, before_version)
        self.assertEqual(DishRecipe.objects.count(), 2)          # no archived copy
        std = DishStandard.objects.get(dish_recipe=self.no_std)
        self.assertEqual(std.portion_weight_g, Decimal('250'))
        self.assertIsNone(std.serving_temp_c)                    # '' coerced to NULL

        update = self.client.patch(
            f'/api/cookbook/dish-standards/{self.no_std.id}/',
            {'aroma': 'Deep, charred'}, format='json',
        )
        self.assertEqual(update.status_code, 200)
        std.refresh_from_db()
        self.assertEqual(std.aroma, 'Deep, charred')
        self.assertEqual(std.portion_weight_g, Decimal('250'))   # untouched field kept

    def test_approve_and_clear(self):
        approve = self.client.post(
            f'/api/cookbook/dish-standards/{self.with_std.id}/approve/',
            {'qa_approved_by': str(self.qa.id)}, format='json',
        )
        self.assertEqual(approve.status_code, 200, approve.data)
        self.assertTrue(approve.data['needs_review'] is False)
        std = DishStandard.objects.get(dish_recipe=self.with_std)
        self.assertEqual(std.qa_approved_by, self.qa)
        self.assertIsNotNone(std.approval_date)

        cleared = self.client.post(
            f'/api/cookbook/dish-standards/{self.with_std.id}/approve/',
            {'qa_approved_by': None}, format='json',
        )
        self.assertEqual(cleared.status_code, 200)
        std.refresh_from_db()
        self.assertIsNone(std.qa_approved_by)
        self.assertIsNone(std.approval_date)

    def test_approve_a_dish_with_no_standard_is_400(self):
        resp = self.client.post(
            f'/api/cookbook/dish-standards/{self.no_std.id}/approve/',
            {'qa_approved_by': str(self.qa.id)}, format='json',
        )
        self.assertEqual(resp.status_code, 400)


class StandardsScopeTests(APITestCase):
    def setUp(self):
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.salmiya = Branch.objects.create(name_en='Salmiya', code='SLM', sort_order=1)
        self.jabriya = Branch.objects.create(name_en='Jabriya', code='JBR', sort_order=2)
        self.sal_dish = make_dish('Salmiya Tabbouleh', 'S1', branch=self.salmiya, section=self.section)
        self.jab_dish = make_dish('Jabriya Tabbouleh', 'J1', branch=self.jabriya, section=self.section)
        DishStandard.objects.create(dish_recipe=self.sal_dish, portion_weight_g=Decimal('180'))
        self.admin = User.objects.create_superuser('boss', password='x')

    def _user(self, role_name, branches=(), extra=(), denied=(), override=None):
        u = User.objects.create_user(f'u{User.objects.count()}', password='x')
        p = u.profile
        p.role = Role.objects.get(name=role_name)
        # override the role's default scope only when we pin specific branches
        p.scope_overridden = bool(branches) if override is None else override
        p.save()
        p.branches.set(branches)
        p.extra_capabilities.set(Capability.objects.filter(code__in=extra))
        p.denied_capabilities.set(Capability.objects.filter(code__in=denied))
        return u

    def api(self, user):
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(user)
        return c

    def test_qa_manager_sees_all_branches(self):
        c = self.api(self._user('QA Manager'))
        resp = c.get('/api/cookbook/dish-standards/')
        self.assertEqual({r['name_en'] for r in resp.data['results']},
                         {'Salmiya Tabbouleh', 'Jabriya Tabbouleh'})

    def test_branch_scoped_user_is_filtered(self):
        # Restaurant Cook has standard.view but is branch-scoped
        c = self.api(self._user('Restaurant Cook', branches=[self.salmiya], extra=['standard.view']))
        resp = c.get('/api/cookbook/dish-standards/')
        self.assertEqual({r['name_en'] for r in resp.data['results']}, {'Salmiya Tabbouleh'})
        self.assertEqual(c.get(f'/api/cookbook/dish-standards/{self.jab_dish.id}/').status_code, 404)

    def test_standard_edit_capability_required_for_patch(self):
        c = self.api(self._user('Restaurant Cook', branches=[self.salmiya], extra=['standard.view']))
        resp = c.patch(f'/api/cookbook/dish-standards/{self.sal_dish.id}/',
                       {'aroma': 'x'}, format='json')
        self.assertEqual(resp.status_code, 403)

        c2 = self.api(self._user('QA Manager'))   # has standard.edit
        ok = c2.patch(f'/api/cookbook/dish-standards/{self.sal_dish.id}/',
                      {'aroma': 'Bright'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
