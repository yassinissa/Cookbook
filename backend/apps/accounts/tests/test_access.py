"""RBAC: resolver, capability enforcement, data scoping, per-user overrides."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.access import ALL, access_for
from apps.accounts.models import Capability, Role, UserProfile
from apps.cookbook.models import Branch, DishRecipe, MenuCategory, Section
from apps.cookbook.tests.support import (
    TABBOULEH_LINES, fake_inventory_items, make_tabbouleh_items, make_units,
)

User = get_user_model()


class Base(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.category = MenuCategory.objects.create(name='Salad')
        self.salmiya = Branch.objects.create(name_en='Salmiya', code='SLM', sort_order=1)
        self.jabriya = Branch.objects.create(name_en='Jabriya', code='JBR', sort_order=2)

        self.admin = User.objects.create_superuser('boss', password='x')
        self._seed_dish('Salmiya Tabbouleh', '100', self.salmiya)
        self._seed_dish('Jabriya Tabbouleh', '200', self.jabriya)

    def _seed_dish(self, name, code, branch):
        d = DishRecipe.objects.create(
            name_en=name, recipe_code=code, branch=branch.name_en, branch_ref=branch,
            category=self.category, section=self.section, selling_price=Decimal('3.000'),
            cost=Decimal('0.800'), cost_breakdown={'food_cost_pct': '26.67', 'per_serving': '0.800'},
        )
        return d

    def cook(self, role_name='Restaurant Cook', branches=(), extra=(), denied=(), override=True):
        u = User.objects.create_user(f'u{User.objects.count()}', password='x')
        p = u.profile  # created by signal
        p.role = Role.objects.get(name=role_name)
        p.scope_overridden = override
        p.save()
        p.branches.set(branches)
        p.extra_capabilities.set(Capability.objects.filter(code__in=extra))
        p.denied_capabilities.set(Capability.objects.filter(code__in=denied))
        return u

    def api(self, user):
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(user)
        return c


class ResolverTests(Base):
    def test_superuser_has_everything(self):
        a = access_for(self.admin)
        self.assertTrue(a.is_superuser)
        self.assertEqual(a.scope.branch_ids, ALL)
        self.assertTrue(a.can('admin.roles'))

    def test_role_caps_plus_extra_minus_denied(self):
        u = self.cook(extra=['menu.snapshot'], denied=['dish.edit'], branches=[self.salmiya])
        caps = access_for(u).capabilities
        self.assertIn('dish.view', caps)          # from role
        self.assertIn('menu.snapshot', caps)      # extra grant
        self.assertNotIn('dish.edit', caps)       # denied
        self.assertNotIn('admin.users', caps)

    def test_role_default_scope_vs_override(self):
        chef = self.cook(role_name='Executive Chef', override=False)
        self.assertEqual(access_for(chef).scope.branch_ids, ALL)

        cook = self.cook(branches=[self.salmiya])
        ids = access_for(cook).scope.branch_ids
        self.assertEqual(ids, {str(self.salmiya.id)})


class EnforcementTests(Base):
    def test_scoped_list_and_403_on_out_of_scope_edit(self):
        cook = self.cook(branches=[self.salmiya])
        c = self.api(cook)

        listing = c.get('/api/cookbook/dish-recipes/')
        names = {r['name_en'] for r in listing.data['results']}
        self.assertEqual(names, {'Salmiya Tabbouleh'})

        jab = DishRecipe.objects.get(recipe_code='200')
        # not even visible → 404
        self.assertEqual(c.get(f'/api/cookbook/dish-recipes/{jab.id}/').status_code, 404)

        sal = DishRecipe.objects.get(recipe_code='100')
        # visible but Restaurant Cook can edit its own branch
        lines = [{**l, 'unit': str(self.units[l['unit']].id), 'item_name_snapshot': l['item_sku']}
                 for l in TABBOULEH_LINES]
        with fake_inventory_items([]):
            resp = c.patch(f'/api/cookbook/dish-recipes/{sal.id}/',
                           {'name_en': 'Salmiya Tabbouleh v2', 'ingredients': lines,
                            'steps': [{'instruction': 'Mix.'}], 'branch_ref': str(self.salmiya.id)},
                           format='json')
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_missing_capability_is_403(self):
        cook = self.cook(branches=[self.salmiya])   # no dish.delete
        c = self.api(cook)
        sal = DishRecipe.objects.get(recipe_code='100')
        self.assertEqual(c.delete(f'/api/cookbook/dish-recipes/{sal.id}/').status_code, 403)

        # grant it per-user
        cook.profile.denied_capabilities.clear()
        cook.profile.extra_capabilities.set(Capability.objects.filter(code='dish.delete'))
        self.assertEqual(c.delete(f'/api/cookbook/dish-recipes/{sal.id}/').status_code, 204)

    def test_costing_fields_hidden_without_capability(self):
        cook = self.cook(branches=[self.salmiya])   # Restaurant Cook has no costing.view
        c = self.api(cook)
        sal = DishRecipe.objects.get(recipe_code='100')
        data = c.get(f'/api/cookbook/dish-recipes/{sal.id}/').data
        self.assertIsNone(data['cost'])
        self.assertIsNone(data['selling_price'])
        self.assertEqual(data['cost_breakdown'], {})

        cook.profile.extra_capabilities.set(Capability.objects.filter(code='costing.view'))
        data = c.get(f'/api/cookbook/dish-recipes/{sal.id}/').data
        self.assertEqual(data['selling_price'], '3.000')

    def test_admin_endpoint_guarded(self):
        cook = self.cook(branches=[self.salmiya])
        self.assertEqual(self.api(cook).get('/api/accounts/users/').status_code, 403)
        self.assertEqual(self.api(self.admin).get('/api/accounts/users/').status_code, 200)

    def test_me_shape(self):
        cook = self.cook(branches=[self.salmiya])
        data = self.api(cook).get('/api/auth/me/').data
        self.assertEqual(data['role']['name'], 'Restaurant Cook')
        self.assertIn('dish.view', data['capabilities'])
        self.assertEqual([b['name_en'] for b in data['scope']['branches']], ['Salmiya'])
        self.assertEqual(data['scope']['prep_kitchens'], [])

        self.assertEqual(self.api(self.admin).get('/api/auth/me/').data['scope']['branches'], 'all')
