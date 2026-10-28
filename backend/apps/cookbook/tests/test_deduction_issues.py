"""
POS deduction issues — inventory-platform's per-line import issues, grouped by
root cause and resolved to where they're fixed in Cookbook. The inventory
client is faked; nothing here touches the network.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook import deduction_issues as di
from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeIngredient, DishModifierGroup, ModifierGroup,
    ModifierOption, ModifierOptionIngredient,
)
from apps.integrations.inventory_client import InventoryAPIError

from .support import make_units

User = get_user_model()
TODAY = date.today().isoformat()
OLD = (date.today() - timedelta(days=40)).isoformat()


def _line(item, mod='', qty=2, issues=()):
    return {'pos_item_name': item, 'pos_modifier': mod, 'quantity_sold': str(qty),
            'issues': list(issues)}


def _issue(code, level='error', **kw):
    return {'code': code, 'level': level, 'message': f'{code} happened', 'fix': 'inventory says', **kw}


class FakeClient:
    def __init__(self, imports, details, branches=None):
        self.imports, self.details, self.detail_calls = imports, details, []
        self.branches = branches or [{'id': 'b1', 'name_en': 'Dine Salmiya', 'brand': 'dine'},
                                     {'id': 'b2', 'name_en': 'Luma City', 'brand': 'luma'}]

    def get_branches(self):
        return self.branches

    def get_pos_reports(self, params=None):
        return {'count': len(self.imports), 'next': None, 'results': self.imports}

    def get_pos_report(self, report_id):
        self.detail_calls.append(report_id)
        return self.details[report_id]


def _imp(id_, status='partial', branch='b1', day=TODAY):
    return {'id': id_, 'branch': branch, 'branch_name': {'b1': 'Dine Salmiya', 'b2': 'Luma City'}[branch],
            'import_date': day, 'status': status}


class DeductionIssueResolutionTests(APITestCase):
    def setUp(self):
        self.dine = Branch.objects.create(name_en='Dine', sort_order=1)        # slug "dine"
        self.luma = Branch.objects.create(name_en='Luma', sort_order=2)
        now = timezone.now()
        self.burrito = DishRecipe.objects.create(
            name_en='Burrito', recipe_code='BUR', branch_ref=self.dine, pos_item_name='BURRITO',
            selling_price=Decimal('3'), inventory_recipe_id='inv-1', published_at=now)
        DishRecipe.objects.filter(pk=self.burrito.pk).update(updated_at=now - timedelta(minutes=1))
        DishRecipeIngredient.objects.create(recipe=self.burrito, item_sku='TORT', quantity=1,
                                            unit=make_units()['Pc'])
        self.wrap = DishRecipe.objects.create(name_en='Wrap', recipe_code='WRP', branch_ref=self.dine)
        grp = ModifierGroup.objects.create(name_en='Burrito build')
        DishModifierGroup.objects.create(dish=self.burrito, group=grp)
        self.cheese = ModifierOption.objects.create(group=grp, name_en='Extra Cheese', kind='addon',
                                                    pos_mods_string='(X) EXTRA CHEESE')
        self.spicy = ModifierOption.objects.create(group=grp, name_en='Spicy', kind='choice',
                                                   pos_mods_string='SPICY', no_consumption_impact=True)
        self.lamb = ModifierOption.objects.create(group=grp, name_en='Lamb', kind='choice',
                                                  pos_mods_string='LAMB')
        ModifierOptionIngredient.objects.create(option=self.lamb, item_sku='LAMB', quantity=100)

    def _run(self, lines, imports=None, items=None, brands=None):
        imports = imports or [_imp('i1')]
        client = FakeClient(imports, {'i1': {'lines': lines, 'error_log': ''}})
        return di.collect_deduction_issues(days=14, brands=brands, client=client,
                                           items_by_sku=items or {}), client

    def _only(self, lines, **kw):
        data, _ = self._run(lines, **kw)
        self.assertEqual(len(data['issues']), 1, data['issues'])
        return data['issues'][0]

    def test_no_recipe_dish_missing_and_unpublished(self):
        g = self._only([_line('TACO / تاكو', issues=[_issue('no_recipe')])])
        self.assertEqual((g['status'], g['side']), ('dish_missing', 'cookbook'))
        self.assertIn('TACO', g['fix'])

        g = self._only([_line('Wrap', issues=[_issue('no_recipe')])])
        self.assertEqual(g['status'], 'dish_unpublished')
        self.assertEqual(g['target']['path'], f'/recipes/dishes/{self.wrap.id}')

    def test_edited_after_publish_is_stale(self):
        DishRecipe.objects.filter(pk=self.burrito.pk).update(
            updated_at=timezone.now() + timedelta(minutes=5))
        g = self._only([_line('BURRITO', issues=[_issue('recipe_no_ingredients')])])
        self.assertEqual(g['status'], 'dish_stale')

    def test_unknown_brand_is_inventory_side(self):
        data, _ = self._run([_line('X', issues=[_issue('no_recipe')])], imports=[_imp('i1')])
        self.assertEqual(data['issues'][0]['status'], 'dish_missing')   # dine is known
        client = FakeClient([_imp('i1')], {'i1': {'lines': [_line('X', issues=[_issue('no_recipe')])]}},
                            branches=[{'id': 'b1', 'name_en': 'Dine Salmiya', 'brand': 'ghost'}])
        g = di.collect_deduction_issues(client=client)['issues'][0]
        self.assertEqual((g['status'], g['side']), ('brand_unknown', 'inventory'))

    def test_modifier_resolutions(self):
        nm = 'modifier_not_modelled'
        cases = {
            'EXTRA CHEESE': ('option_needs_data', 'cookbook'),     # "(X) " code is ignored
            'Spicy': ('marked_no_impact', 'expected'),
            'LAMB': ('option_unpublished', 'cookbook'),            # has deltas, not on inventory
            'NO ONION': ('option_missing', 'cookbook'),
            'Medium - Spicy': ('marked_no_impact', 'expected'),    # compound modifier part
        }
        for mod, want in cases.items():
            g = self._only([_line('BURRITO', mod, issues=[_issue(nm, level='warning')])])
            self.assertEqual((g['status'], g['side']), want, mod)
            self.assertFalse(g['retryable'])
        g = self._only([_line('BURRITO', 'EXTRA CHEESE', issues=[_issue(nm, level='warning')])])
        self.assertEqual(g['target']['path'], f'/pos?group={self.cheese.group_id}')

    def test_conversion_and_stock(self):
        items = {'OIL': {'id': 77, 'sku': 'OIL', 'name_en': 'Olive Oil'}}
        g = self._only([_line('BURRITO', issues=[_issue(
            'unit_conversion_missing', item='Olive Oil', item_id='77', from_unit='Tbs', to_unit='LTR')])],
            items=items)
        self.assertEqual((g['status'], g['side']), ('conversion_missing', 'cookbook'))
        self.assertEqual(g['target']['path'], '/inventory?q=OIL')
        self.assertIn('1 LTR', g['fix'])

        g = self._only([_line('BURRITO', issues=[_issue('insufficient_stock', item='Tortilla',
                                                        item_id='9', needed=4, available=1)])])
        self.assertEqual((g['status'], g['side']), ('stock_short', 'inventory'))
        self.assertEqual(g['fix'], 'inventory says')

    def test_groups_one_cause_across_lines_and_days(self):
        yday = (date.today() - timedelta(days=1)).isoformat()
        issue = _issue('no_recipe')
        client = FakeClient(
            [_imp('i1'), _imp('i2', day=yday)],
            {'i1': {'lines': [_line('Taco', qty=2, issues=[issue]), _line('TACO / تاكو', qty=1, issues=[issue])]},
             'i2': {'lines': [_line('taco', qty=3, issues=[issue])]}})
        data = di.collect_deduction_issues(client=client)
        self.assertEqual(len(data['issues']), 1)
        g = data['issues'][0]
        self.assertEqual((g['occurrences'], g['qty_sold']), (3, 6.0))
        self.assertEqual((g['first_date'], g['last_date']), (yday, TODAY))
        self.assertEqual([r['id'] for r in g['imports']], ['i1', 'i2'])

    def test_skips_completed_reverted_old_and_other_brands(self):
        imports = [_imp('ok', status='completed'), _imp('rev', status='reverted'),
                   _imp('luma', branch='b2'), _imp('old', day=OLD)]
        details = {k: {'lines': [_line('Taco', issues=[_issue('no_recipe')])]} for k in ('luma', 'old')}
        client = FakeClient(imports, details)
        data = di.collect_deduction_issues(client=client, brands={'dine'})
        self.assertEqual(client.detail_calls, [])           # nothing worth reading
        self.assertEqual((data['imports_scanned'], data['issues']), (1, []))

        data = di.collect_deduction_issues(client=FakeClient(imports, details))
        self.assertEqual(data['imports_with_issues'], 1)    # luma; "old" is outside the window

    def test_failed_import_without_lines(self):
        client = FakeClient([_imp('f', status='failed')],
                            {'f': {'lines': [], 'error_log': 'Branch "Dine" has no brand set\nmore'}})
        g = di.collect_deduction_issues(client=client)['issues'][0]
        self.assertEqual((g['code'], g['side']), ('import_failed', 'inventory'))
        self.assertEqual(g['message'], 'Branch "Dine" has no brand set')


class DeductionIssuesApiTests(APITestCase):
    URL = '/api/cookbook/deduction-issues/'

    def setUp(self):
        cache.clear()
        self.dine = Branch.objects.create(name_en='Dine', sort_order=1)
        Branch.objects.create(name_en='Luma', sort_order=2)
        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)
        lines = [_line('Taco', issues=[_issue('no_recipe')])]
        self.fake = FakeClient([_imp('i1'), _imp('i2', branch='b2')],
                               {'i1': {'lines': lines}, 'i2': {'lines': lines}})
        p1 = patch('apps.cookbook.deduction_issues.InventoryClient', return_value=self.fake)
        p2 = patch('apps.cookbook.views_modifiers.get_inventory_items_by_sku', return_value={})
        p1.start(), p2.start()
        self.addCleanup(p1.stop), self.addCleanup(p2.stop)

    def test_shape_cache_and_refresh(self):
        r = self.client.get(self.URL)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['summary'], {'cookbook': 2, 'inventory': 0, 'expected': 0})
        self.assertIn('checked_at', r.data)
        self.client.get(self.URL)
        self.assertEqual(len(self.fake.detail_calls), 2)    # second read was cached
        self.client.get(self.URL + '?refresh=1')
        self.assertEqual(len(self.fake.detail_calls), 4)
        self.assertEqual(self.client.get(self.URL + '?days=x').status_code, 400)

    def test_inventory_down_is_a_502_not_a_500(self):
        def boom(*a, **k):
            raise InventoryAPIError('connection refused')
        self.fake.get_branches = boom
        r = self.client.get(self.URL + '?refresh=1')
        self.assertEqual(r.status_code, 502)
        self.assertIn('connection refused', r.data['detail'])

    def test_gate_and_brand_scope(self):
        chef = User.objects.create_user('chef', password='x')
        chef.profile.role = Role.objects.get(name='Executive Chef')
        chef.profile.scope_overridden = True
        chef.profile.save()
        chef.profile.branches.set([self.dine])
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(chef)
        self.assertEqual(c.get(self.URL).status_code, 403)          # no pos.manage

        chef.profile.extra_capabilities.set([Capability.objects.get(code='pos.manage')])
        r = c.get(self.URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([g['brand'] for g in r.data['issues']], ['dine'])
