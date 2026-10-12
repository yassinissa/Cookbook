"""
Recipe change history:
  GET /api/cookbook/recipe-changes/

Pins the rule that separates a *version* (ingredients + quantities, method,
yield, name / description, menu category or selling price changed — the
system gives it the next version code) from an *adjustment* (anything else —
logged in full, no new version), the itemised before → after record on each
entry, and the feed's filters, scoping and cost-hiding.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeActivityLog, MenuCategory, PrepKitchen, Section,
)
from .support import TABBOULEH_LINES, fake_inventory_items, make_tabbouleh_items, make_units

User = get_user_model()
URL = '/api/cookbook/recipe-changes/'


class RecipeChangeBase(APITestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.section = Section.objects.create(name='Salad', avg_monthly_salary=Decimal('285.78'))
        self.category = MenuCategory.objects.create(name='Salad')
        self.salmiya = Branch.objects.create(name_en='Salmiya', sort_order=1)
        self.jabriya = Branch.objects.create(name_en='Jabriya', sort_order=2)
        self.chef = User.objects.create_superuser('chef', password='x', first_name='Nadia', last_name='Haddad')
        self.client = self.api(self.chef)

    def api(self, user):
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(user)
        return c

    def payload(self, **over):
        lines = [
            {**l, 'unit': str(self.units[l['unit']].id), 'item_name_snapshot': l['item_sku']}
            for l in TABBOULEH_LINES
        ]
        p = {
            'name_en': 'Tabbouleh Salad', 'recipe_code': '1076.9',
            'category': str(self.category.id), 'section': str(self.section.id),
            'branch_ref': str(self.salmiya.id),
            'selling_price': '2.900', 'prep_time_minutes': 3, 'expected_waste_pct': '1.00',
            'include_labor_cost': True, 'ingredients': lines,
            'steps': [{'instruction': 'Mix.'}, {'instruction': 'Serve.'}],
        }
        p.update(over)
        return p

    def create(self, client=None, **over):
        with fake_inventory_items([]):
            r = (client or self.client).post('/api/cookbook/dish-recipes/', self.payload(**over), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data['id']

    def patch(self, rid, payload, client=None):
        with fake_inventory_items([]):
            r = (client or self.client).patch(f'/api/cookbook/dish-recipes/{rid}/', payload, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def feed(self, query='', client=None):
        r = (client or self.client).get(URL + query)
        self.assertEqual(r.status_code, 200, r.data)
        return r.data


class VersionVersusAdjustmentTests(RecipeChangeBase):
    def test_create_is_logged_as_v1_with_the_full_recipe(self):
        rid = self.create()
        entry = self.feed()['results'][0]
        self.assertEqual((entry['action'], entry['version'], entry['is_new_version']), ('created', 1, True))
        self.assertEqual(entry['changed_by'], 'chef')
        self.assertEqual(entry['changed_by_name'], 'Nadia Haddad')
        self.assertEqual(entry['recipe_id'], rid)
        self.assertEqual(len(entry['changes']['ingredients']['added']), len(TABBOULEH_LINES))

    def test_notes_and_prep_time_edit_is_an_adjustment_not_a_version(self):
        rid = self.create()
        data = self.patch(rid, self.payload(notes='Summer menu', prep_time_minutes=5))
        self.assertEqual((data['version'], data['revision']), (1, 'Rev.01'))
        self.assertEqual(DishRecipe.objects.count(), 1)          # nothing archived

        entry = self.feed()['results'][0]
        self.assertEqual((entry['action'], entry['version'], entry['is_new_version']), ('updated', 1, False))
        fields = {f['field']: f for f in entry['changes']['fields']}
        self.assertEqual((fields['notes']['from'], fields['notes']['to']), (None, 'Summer menu'))
        self.assertEqual((fields['prep_time_minutes']['from'], fields['prep_time_minutes']['to']), ('3', '5'))
        self.assertEqual(entry['changes']['ingredients']['changed'], [])

    def test_price_name_description_and_category_each_create_a_version(self):
        rid = self.create()
        other = MenuCategory.objects.create(name='Mezze')
        steps = [
            {'selling_price': '3.500'},
            {'name_en': 'Tabbouleh'},
            {'taste_profile': 'Fresh, tangy.'},
            {'category': str(other.id)},
        ]
        over = {}
        for n, change in enumerate(steps, start=2):
            over.update(change)
            self.assertEqual(self.patch(rid, self.payload(**over))['version'], n, change)
        self.assertEqual(self.feed('?type=version')['count'], 5)        # the create + four revisions

        entry = self.feed()['results'][-2]                              # the price revision
        fields = {f['field']: f for f in entry['changes']['fields']}
        self.assertEqual((fields['selling_price']['from'], fields['selling_price']['to']), ('2.900', '3.500'))

    def test_the_system_assigns_the_version_code(self):
        rid = self.create(revision='Typed by hand')
        dish = DishRecipe.objects.get(pk=rid)
        self.assertEqual(dish.revision, 'Rev.01')
        self.assertIsNotNone(dish.revision_date)

        # an adjustment keeps the code, even if a stale form sends another one
        self.assertEqual(self.patch(rid, self.payload(notes='x', revision='Rev.99'))['revision'], 'Rev.01')

        p = self.payload(notes='x', revision='Rev.99')
        p['ingredients'][0]['quantity'] = '90'
        self.assertEqual(self.patch(rid, p)['revision'], 'Rev.02')
        archived = DishRecipe.objects.exclude(pk=rid).get()
        self.assertEqual((archived.version, archived.revision), (1, 'Rev.01'))   # the old version keeps its code
        revision = [f for f in self.feed()['results'][0]['changes']['fields'] if f['field'] == 'revision']
        self.assertEqual(revision, [{'field': 'revision', 'from': 'Rev.01', 'to': 'Rev.02'}])

    def test_a_cost_recalculation_is_never_a_version(self):
        rid = self.create()
        with fake_inventory_items([]):
            r = self.client.post(f'/api/cookbook/dish-recipes/{rid}/recalculate/')
        self.assertEqual((r.status_code, r.data['version'], r.data['revision']), (200, 1, 'Rev.01'))
        entry = self.feed()['results'][0]
        self.assertEqual((entry['action'], entry['is_new_version']), ('recalculated', False))

    def test_ingredient_quantity_change_creates_a_version(self):
        rid = self.create()
        p = self.payload()
        p['ingredients'][0]['quantity'] = '90'
        self.assertEqual(self.patch(rid, p)['version'], 2)

        entry = self.feed()['results'][0]
        self.assertEqual((entry['version'], entry['is_new_version']), (2, True))
        (line,) = entry['changes']['ingredients']['changed']
        self.assertEqual(line['changed'], ['quantity'])
        self.assertEqual(Decimal(line['to']['quantity']), Decimal('90'))
        self.assertEqual(line['from']['item_sku'], TABBOULEH_LINES[0]['item_sku'])

    def test_adding_and_removing_an_ingredient_creates_a_version(self):
        rid = self.create()
        p = self.payload()
        dropped = p['ingredients'].pop()
        self.assertEqual(self.patch(rid, p)['version'], 2)
        removed = self.feed()['results'][0]['changes']['ingredients']['removed']
        self.assertEqual([l['item_sku'] for l in removed], [dropped['item_sku']])

        self.assertEqual(self.patch(rid, self.payload())['version'], 3)
        added = self.feed()['results'][0]['changes']['ingredients']['added']
        self.assertEqual([l['item_sku'] for l in added], [dropped['item_sku']])

    def test_method_edit_creates_a_version_and_pairs_the_reworded_step(self):
        rid = self.create()
        data = self.patch(rid, self.payload(steps=[{'instruction': 'Mix gently.'}, {'instruction': 'Serve.'}]))
        self.assertEqual(data['version'], 2)
        steps = self.feed()['results'][0]['changes']['steps']
        self.assertEqual(steps['changed'], [{'n': 1, 'from': 'Mix.', 'to': 'Mix gently.'}])
        self.assertEqual((steps['added'], steps['removed']), ([], []))

    def test_reordering_ingredients_is_logged_but_not_a_version(self):
        rid = self.create()
        p = self.payload()
        p['ingredients'].reverse()
        self.assertEqual(self.patch(rid, p)['version'], 1)
        entry = self.feed()['results'][0]
        self.assertFalse(entry['is_new_version'])
        self.assertTrue(entry['changes']['ingredients']['reordered'])

    def test_a_save_that_changes_nothing_leaves_no_entry(self):
        rid = self.create()
        self.patch(rid, self.payload())
        self.assertEqual(DishRecipeActivityLog.objects.filter(recipe_id=rid).count(), 1)

    def test_versions_endpoint_names_who_made_each_version(self):
        rid = self.create()
        p = self.payload()
        p['ingredients'][0]['quantity'] = '90'
        self.patch(rid, p)
        versions = self.client.get(f'/api/cookbook/dish-recipes/{rid}/versions/').data['versions']
        self.assertEqual([(v['version'], v['changed_by']) for v in versions], [(1, 'chef'), (2, 'chef')])

    def test_legacy_version_row_without_changes_is_rebuilt_from_snapshots(self):
        rid = self.create()
        p = self.payload()
        p['ingredients'][0]['quantity'] = '90'
        self.patch(rid, p)
        DishRecipeActivityLog.objects.filter(recipe_id=rid, version=2).update(changes={})
        entry = self.feed()['results'][0]
        self.assertTrue(entry['changes_reconstructed'])
        self.assertEqual(len(entry['changes']['ingredients']['changed']), 1)


class RecipeChangeFeedTests(RecipeChangeBase):
    def setUp(self):
        super().setUp()
        self.tab = self.create()
        self.fat = self.create(name_en='Fattoush', recipe_code='F1', branch_ref=str(self.jabriya.id))
        p = self.payload()
        p['ingredients'][0]['quantity'] = '90'
        self.patch(self.tab, p)                                            # version
        self.patch(self.tab, {**p, 'notes': 'Keep chilled'})               # adjustment

    def test_filters(self):
        self.assertEqual(self.feed()['count'], 4)
        self.assertEqual(self.feed()['versions'], 3)                       # 2 creates + 1 revision
        self.assertEqual(self.feed('?type=version')['count'], 3)
        self.assertEqual(self.feed('?type=adjustment')['count'], 1)
        self.assertEqual(self.feed('?q=fatt')['count'], 1)
        self.assertEqual(self.feed('?q=1076')['count'], 3)                 # by recipe code
        self.assertEqual(self.feed(f'?recipe={self.tab}')['count'], 3)
        self.assertEqual(self.feed('?actor=nobody')['count'], 0)
        self.assertEqual(self.feed('?date_from=2999-01-01')['count'], 0)
        self.assertEqual(self.feed('?kind=production')['count'], 0)
        self.assertEqual(self.feed()['actors'], [{'username': 'chef', 'name': 'Nadia Haddad'}])

    def test_bad_params_are_400(self):
        for q in ('?type=bogus', '?kind=menu', '?date_from=nope', '?page=x'):
            self.assertEqual(self.client.get(URL + q).status_code, 400, q)

    def test_all_adds_non_edit_events_for_the_recipe_timeline(self):
        std = self.client.patch(f'/api/cookbook/dish-standards/{self.tab}/',
                                {'portion_weight': '250'}, format='json')
        self.assertIn(std.status_code, (200, 201), std.data)
        self.assertEqual(self.feed(f'?recipe={self.tab}')['count'], 3)
        rows = self.feed(f'?recipe={self.tab}&all=1')
        self.assertEqual(rows['count'], 4)
        self.assertEqual(rows['results'][0]['action'], 'standard_updated')

    def _user(self, role_name, branches=(), extra=()):
        u = User.objects.create_user(f'u{User.objects.count()}', password='x')
        prof = u.profile
        prof.role = Role.objects.get(name=role_name)
        prof.scope_overridden = bool(branches)
        prof.save()
        prof.branches.set(branches)
        prof.extra_capabilities.set(Capability.objects.filter(code__in=extra))
        return u

    def test_requires_recipe_history(self):
        staff = self._user('Branch Staff', branches=[self.salmiya])
        self.assertEqual(self.api(staff).get(URL).status_code, 403)

    def test_branch_scope(self):
        cook = self._user('Restaurant Cook', branches=[self.jabriya])
        names = {e['recipe_name'] for e in self.feed(client=self.api(cook))['results']}
        self.assertEqual(names, {'Fattoush'})

    def test_money_fields_hidden_without_costing_view(self):
        qa = self._user('QA Manager')
        self.assertFalse(Role.objects.get(name='QA Manager').capabilities.filter(code='costing.view').exists())
        for entry in self.feed(client=self.api(qa))['results']:
            for f in (entry['changes'] or {}).get('fields', []):
                self.assertNotIn(f['field'], ('selling_price', 'cost', 'labor_cost'))
        # the creation still lists what a QA manager may see
        created = self.feed(f'?recipe={self.fat}', client=self.api(qa))['results'][0]
        self.assertIn('name_en', {f['field'] for f in created['changes']['fields']})
        self.assertIn('selling_price', {f['field'] for f in self.feed(f'?recipe={self.fat}')['results'][0]['changes']['fields']})


class ProductionChangeTests(RecipeChangeBase):
    def test_yield_change_is_a_version_and_notes_are_not(self):
        kitchen = PrepKitchen.objects.get(name_en='Sauce')
        kg = self.units['Kg']
        line = TABBOULEH_LINES[0]
        payload = {
            'name_en': 'Toum', 'prep_kitchen_ref': str(kitchen.id), 'section': str(self.section.id),
            'output_item_sku': 'PR-TOUM', 'output_qty': '1.000', 'output_unit': str(kg.id),
            'include_labor_cost': False,
            'ingredients': [{**line, 'unit': str(self.units[line['unit']].id), 'item_name_snapshot': 'x'}],
            'steps': [{'instruction': 'Blend.'}],
        }
        with fake_inventory_items([]):
            rid = self.client.post('/api/cookbook/production-recipes/', payload, format='json').data['id']
            r = self.client.patch(f'/api/cookbook/production-recipes/{rid}/',
                                  {**payload, 'notes': 'Keep chilled'}, format='json')
            self.assertEqual(r.data['version'], 1)
            r = self.client.patch(f'/api/cookbook/production-recipes/{rid}/',
                                  {**payload, 'notes': 'Keep chilled', 'output_qty': '2.000'}, format='json')
            self.assertEqual(r.data['version'], 2)

        rows = self.feed('?kind=production')['results']
        self.assertEqual([(e['action'], e['is_new_version']) for e in rows],
                         [('updated', True), ('updated', False), ('created', True)])
        self.assertIn('output_qty', rows[0]['summary']['fields_changed'])


class LocationScopeTests(RecipeChangeBase):
    """A prep kitchen sees only its own recipes' changes; a restaurant only
    its own dishes' — on the feed, when asking for a recipe by id, and on the
    per-recipe version endpoints."""

    def setUp(self):
        super().setUp()
        self.sauce = PrepKitchen.objects.get(name_en='Sauce')
        self.meat = PrepKitchen.objects.get(name_en='Meat')
        self.toum = self._production('Toum', self.sauce)
        self.kofta = self._production('Kofta Mix', self.meat)
        self.tab = self.create()                                           # Salmiya dish
        self.fat = self.create(name_en='Fattoush', branch_ref=str(self.jabriya.id))

    def _production(self, name, kitchen):
        line = TABBOULEH_LINES[0]
        payload = {
            'name_en': name, 'prep_kitchen_ref': str(kitchen.id), 'section': str(self.section.id),
            'output_item_sku': f'PR-{name}', 'output_qty': '1.000', 'output_unit': str(self.units['Kg'].id),
            'include_labor_cost': False,
            'ingredients': [{**line, 'unit': str(self.units[line['unit']].id), 'item_name_snapshot': 'x'}],
            'steps': [{'instruction': 'Blend.'}],
        }
        with fake_inventory_items([]):
            r = self.client.post('/api/cookbook/production-recipes/', payload, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data['id']

    def _user(self, role_name, branches=(), kitchens=()):
        u = User.objects.create_user(f'u{User.objects.count()}', password='x')
        prof = u.profile
        prof.role = Role.objects.get(name=role_name)
        prof.scope_overridden = True
        prof.save()
        prof.branches.set(branches)
        prof.prep_kitchens.set(kitchens)
        return self.api(u)

    def test_meat_prep_cannot_see_sauce_prep_changes(self):
        meat = self._user('Prep Kitchen Manager', kitchens=[self.meat])
        feed = self.feed(client=meat)
        self.assertEqual({e['recipe_name'] for e in feed['results']}, {'Kofta Mix'})
        self.assertEqual(feed['actors'], [{'username': 'chef', 'name': 'Nadia Haddad'}])
        # not by search, not by asking for the sauce recipe outright
        self.assertEqual(self.feed('?q=toum', client=meat)['count'], 0)
        self.assertEqual(self.feed(f'?recipe={self.toum}&all=1', client=meat)['count'], 0)
        self.assertEqual(meat.get(f'/api/cookbook/production-recipes/{self.toum}/versions/').status_code, 404)
        self.assertEqual(meat.get(f'/api/cookbook/production-recipes/{self.toum}/diff/').status_code, 404)
        # and no restaurant dishes at all
        self.assertEqual(self.feed('?kind=dish', client=meat)['count'], 0)

    def test_a_restaurant_sees_only_its_own_dishes(self):
        salmiya = self._user('Branch Manager', branches=[self.salmiya])
        self.assertEqual({e['recipe_name'] for e in self.feed(client=salmiya)['results']}, {'Tabbouleh Salad'})
        self.assertEqual(self.feed(f'?recipe={self.fat}&all=1', client=salmiya)['count'], 0)
        self.assertEqual(salmiya.get(f'/api/cookbook/dish-recipes/{self.fat}/versions/').status_code, 404)
        self.assertEqual(self.feed('?kind=production', client=salmiya)['count'], 0)

    def test_a_scoped_user_with_no_location_sees_nothing(self):
        nowhere = self._user('Prep Kitchen Manager')
        self.assertEqual(self.feed(client=nowhere)['count'], 0)
