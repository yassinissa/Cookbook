"""
Activity & History feed: merges dish + production logs newest-first,
filters by kind / action / actor / recipe / date, paginates, and respects
branch + prep-kitchen scope.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import (
    ActivityActionType, Branch, DishRecipe, DishRecipeActivityLog,
    PrepKitchen, ProductionRecipe, ProductionRecipeActivityLog, Section,
)
from .support import make_units

User = get_user_model()


def log_dish(recipe, action, by='nadia', ago_hours=0):
    row = DishRecipeActivityLog.objects.create(
        recipe=recipe, action_type=action, changed_by=by, description='')
    if ago_hours:
        DishRecipeActivityLog.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(hours=ago_hours))
    return row


def log_prod(recipe, action, by='karim', ago_hours=0):
    row = ProductionRecipeActivityLog.objects.create(
        recipe=recipe, action_type=action, changed_by=by, description='')
    if ago_hours:
        ProductionRecipeActivityLog.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(hours=ago_hours))
    return row


class ActivityFeedTests(APITestCase):
    def setUp(self):
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285'))
        self.salmiya = Branch.objects.create(name_en='Salmiya', code='SLM', sort_order=1)
        self.jabriya = Branch.objects.create(name_en='Jabriya', code='JBR', sort_order=2)
        self.sauce = PrepKitchen.objects.get(name_en='Sauce')
        self.kg = make_units()['Kg']

        self.sal_dish = DishRecipe.objects.create(
            name_en='Tabbouleh', recipe_code='T1', branch='Salmiya', branch_ref=self.salmiya,
            section=self.section, cost=Decimal('0.8'))
        self.jab_dish = DishRecipe.objects.create(
            name_en='Fattoush', recipe_code='F1', branch='Jabriya', branch_ref=self.jabriya,
            section=self.section, cost=Decimal('0.9'))
        self.prod = ProductionRecipe.objects.create(
            name_en='Toum', recipe_code='P1', prep_kitchen_ref=self.sauce, section=self.section,
            output_item_sku='PR-TOUM', output_qty=Decimal('1'), output_unit=self.kg, cost=Decimal('0.5'))

        log_dish(self.sal_dish, ActivityActionType.CREATED, by='nadia', ago_hours=24 * 8)
        log_dish(self.sal_dish, ActivityActionType.UPDATED, by='omar', ago_hours=20)
        log_dish(self.sal_dish, ActivityActionType.STANDARD_APPROVED, by='lina', ago_hours=2)
        log_dish(self.jab_dish, ActivityActionType.CREATED, by='nadia', ago_hours=24 * 6)
        log_prod(self.prod, ActivityActionType.CREATED, by='karim', ago_hours=24 * 4)
        log_prod(self.prod, ActivityActionType.RECALCULATED, by='karim', ago_hours=1)

        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_merges_both_kinds_newest_first(self):
        r = self.client.get('/api/cookbook/activity/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['count'], 6)
        kinds_actions = [(e['kind'], e['action']) for e in r.data['results']]
        self.assertEqual(kinds_actions[0], ('production', 'recalculated'))   # 1h ago
        self.assertEqual(kinds_actions[1], ('dish', 'standard_approved'))     # 2h ago
        self.assertEqual(sorted(r.data['actors']), ['karim', 'lina', 'nadia', 'omar'])
        self.assertEqual(r.data['results'][0]['recipe_path'], f'/recipes/production/{self.prod.id}')

    def test_filter_by_kind(self):
        r = self.client.get('/api/cookbook/activity/?kind=dish')
        self.assertTrue(all(e['kind'] == 'dish' for e in r.data['results']))
        self.assertEqual(r.data['count'], 4)

    def test_filter_by_action_and_actor(self):
        r = self.client.get('/api/cookbook/activity/?action=created')
        self.assertEqual(r.data['count'], 3)
        r = self.client.get('/api/cookbook/activity/?actor=karim')
        self.assertEqual(r.data['count'], 2)
        r = self.client.get('/api/cookbook/activity/?action=created,recalculated&actor=nadia')
        self.assertEqual(r.data['count'], 2)

    def test_filter_by_recipe(self):
        r = self.client.get(f'/api/cookbook/activity/?recipe={self.sal_dish.id}')
        self.assertEqual(r.data['count'], 3)
        self.assertTrue(all(e['recipe_id'] == str(self.sal_dish.id) for e in r.data['results']))

    def test_filter_by_date(self):
        # cutoff 3 days back: the 8-, 6- and 4-day-old rows fall before it,
        # the three rows from the last day (20h, 2h, 1h) do not.
        cutoff = (timezone.now() - timedelta(days=3)).date().isoformat()
        r = self.client.get(f'/api/cookbook/activity/?date_from={cutoff}')
        self.assertEqual(r.data['count'], 3)

        r = self.client.get(f'/api/cookbook/activity/?date_to={cutoff}')
        self.assertEqual(r.data['count'], 3)   # the 8- / 6- / 4-day rows

    def test_pagination(self):
        r = self.client.get('/api/cookbook/activity/?page_size=2&page=2')
        self.assertEqual(r.data['page'], 2)
        self.assertEqual(r.data['num_pages'], 3)
        self.assertEqual(len(r.data['results']), 2)

    def test_bad_params_are_400(self):
        self.assertEqual(self.client.get('/api/cookbook/activity/?kind=menu').status_code, 400)
        self.assertEqual(self.client.get('/api/cookbook/activity/?action=bogus').status_code, 400)
        self.assertEqual(self.client.get('/api/cookbook/activity/?date_from=nope').status_code, 400)


class ActivityScopeTests(APITestCase):
    def setUp(self):
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285'))
        self.salmiya = Branch.objects.create(name_en='Salmiya', code='SLM', sort_order=1)
        self.jabriya = Branch.objects.create(name_en='Jabriya', code='JBR', sort_order=2)
        self.sauce = PrepKitchen.objects.get(name_en='Sauce')
        self.kg = make_units()['Kg']

        self.sal_dish = DishRecipe.objects.create(
            name_en='Tabbouleh', recipe_code='T1', branch_ref=self.salmiya,
            section=self.section, cost=Decimal('0.8'))
        self.jab_dish = DishRecipe.objects.create(
            name_en='Fattoush', recipe_code='F1', branch_ref=self.jabriya,
            section=self.section, cost=Decimal('0.9'))
        self.prod = ProductionRecipe.objects.create(
            name_en='Toum', recipe_code='P1', prep_kitchen_ref=self.sauce, section=self.section,
            output_item_sku='PR-TOUM', output_qty=Decimal('1'), output_unit=self.kg, cost=Decimal('0.5'))
        log_dish(self.sal_dish, ActivityActionType.CREATED)
        log_dish(self.jab_dish, ActivityActionType.CREATED)
        log_prod(self.prod, ActivityActionType.CREATED)

    def _user(self, role_name, branches=(), extra=()):
        u = User.objects.create_user(f'u{User.objects.count()}', password='x')
        p = u.profile
        p.role = Role.objects.get(name=role_name)
        p.scope_overridden = bool(branches)
        p.save()
        p.branches.set(branches)
        p.extra_capabilities.set(Capability.objects.filter(code__in=extra))
        return u

    def api(self, user):
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(user)
        return c

    def test_activity_view_capability_required(self):
        # Restaurant Cook has no activity.view
        cook = self._user('Restaurant Cook', branches=[self.salmiya])
        self.assertEqual(self.api(cook).get('/api/cookbook/activity/').status_code, 403)

    def test_branch_scoped_dish_activity(self):
        cook = self._user('Restaurant Cook', branches=[self.salmiya], extra=['activity.view'])
        r = self.api(cook).get('/api/cookbook/activity/')
        names = {e['recipe_name'] for e in r.data['results']}
        self.assertEqual(names, {'Tabbouleh'})   # no Jabriya dish, no production (no production.view? cook has it)

    def test_production_activity_hidden_without_capability(self):
        # QA Manager has activity.view + production.view -> sees production
        qa = self._user('QA Manager')
        r = self.api(qa).get('/api/cookbook/activity/')
        self.assertIn('production', {e['kind'] for e in r.data['results']})
