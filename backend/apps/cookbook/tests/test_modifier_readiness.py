"""
Modifier consumption-effect model: `deltas` reconcile-by-id, `deduction_status`
for every kind/state, the readiness worklist endpoint, and the
`audit_modifier_coverage` command.
"""
import io
import tempfile
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeIngredient, UnitScale,
    ModifierGroup, ModifierOption, ModifierOptionIngredient, DishModifierGroup,
)

User = get_user_model()


class DeductionStatusTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)
        self.g = ModifierGroup.objects.create(name_en='Effect Cases')

    def _opt(self, **kw):
        kw.setdefault('name_en', 'X')
        return ModifierOption.objects.create(group=self.g, **kw)

    def test_status_per_kind(self):
        choice = self._opt(name_en='Spicy', kind='choice')
        self.assertEqual(choice.deduction_status, 'needs_data')       # unconfirmed

        choice.no_consumption_impact = True
        choice.save()
        self.assertEqual(choice.deduction_status, 'no_impact')

        addon = self._opt(name_en='Extra Shrimp', kind='addon')
        self.assertEqual(addon.deduction_status, 'needs_data')
        ModifierOptionIngredient.objects.create(option=addon, item_sku='SHR-1',
                                                quantity=Decimal('60'), direction='add')
        addon.refresh_from_db()
        self.assertEqual(addon.deduction_status, 'ready')

        removal = self._opt(name_en='No Crab', kind='instruction')
        self.assertEqual(removal.deduction_status, 'needs_data')
        ModifierOptionIngredient.objects.create(option=removal, item_sku='CRB-1',
                                                quantity=Decimal('40'), direction='remove')
        removal.refresh_from_db()
        self.assertEqual(removal.deduction_status, 'ready')

    def test_type_needs_published_variant_or_deltas(self):
        branch = Branch.objects.create(name_en='WnR', sort_order=1)
        variant = DishRecipe.objects.create(name_en='Kindo Beef', recipe_code='K1', branch_ref=branch)
        t = self._opt(name_en='Beef', kind='type', variant_recipe=variant)
        self.assertEqual(t.deduction_status, 'needs_data')            # variant not published
        self.assertIn('not published', t.missing[0])

        variant.inventory_recipe_id = 'inv-1'
        variant.save(update_fields=['inventory_recipe_id'])
        t.refresh_from_db()
        self.assertEqual(t.deduction_status, 'ready')

    def test_deltas_reconciled_by_id(self):
        r = self.client.post('/api/cookbook/modifier-groups/', {
            'name_en': 'Add-ons', 'selection': 'multi',
            'options': [{
                'name_en': 'Loaded', 'kind': 'addon', 'price_delta': '1.5',
                'deltas': [
                    {'item_sku': 'CHZ', 'quantity': '30', 'direction': 'add'},
                    {'item_sku': 'BAC', 'quantity': '15', 'direction': 'add'},
                ],
            }],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        opt = r.data['options'][0]
        self.assertEqual(len(opt['deltas']), 2)
        gid = r.data['id']
        keep = next(d['id'] for d in opt['deltas'] if d['item_sku'] == 'CHZ')

        p = self.client.patch(f'/api/cookbook/modifier-groups/{gid}/', {
            'options': [{
                'id': opt['id'], 'name_en': 'Loaded', 'kind': 'addon',
                'deltas': [
                    {'id': keep, 'item_sku': 'CHZ', 'quantity': '45', 'direction': 'add'},
                    {'item_sku': 'JAL', 'quantity': '10', 'direction': 'add'},
                ],
            }],
        }, format='json')
        self.assertEqual(p.status_code, 200, p.data)
        skus = set(ModifierOptionIngredient.objects.filter(option_id=opt['id'])
                   .values_list('item_sku', flat=True))
        self.assertEqual(skus, {'CHZ', 'JAL'})                         # BAC dropped, JAL added
        self.assertEqual(
            ModifierOptionIngredient.objects.get(option_id=opt['id'], item_sku='CHZ').quantity,
            Decimal('45.000'))


class ReadinessEndpointTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

        self.branch = Branch.objects.create(name_en='WnR', sort_order=1)
        self.dish = DishRecipe.objects.create(name_en='Mongolian', recipe_code='M1',
                                              branch_ref=self.branch, pos_item_name='Mongolian')
        self.g = ModifierGroup.objects.create(name_en='Protein')
        self.beef = ModifierOption.objects.create(group=self.g, name_en='Beef', kind='choice',
                                                  pos_mods_string='Beef')
        self.chic = ModifierOption.objects.create(group=self.g, name_en='Chicken', kind='choice',
                                                  no_consumption_impact=True)
        DishModifierGroup.objects.create(dish=self.dish, group=self.g, default_role='forced')

    def test_worklist_shape_and_summary(self):
        r = self.client.get('/api/cookbook/modifier-readiness/')
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d['summary']['total'], 2)
        self.assertEqual(d['summary']['needs_data'], 1)
        self.assertEqual(d['summary']['no_impact'], 1)

        beef = next(o for o in d['options'] if o['name_en'] == 'Beef')
        self.assertEqual(beef['status'], 'needs_data')
        self.assertEqual(beef['used_by'][0]['dish'], 'Mongolian')
        self.assertEqual(beef['used_by'][0]['branch'], 'WnR')
        self.assertTrue(beef['has_match_key'])

    def test_gated_on_pos_manage(self):
        cook = User.objects.create_user('cook', password='x')
        cook.profile.role = Role.objects.get(name='Restaurant Cook')
        cook.profile.save()
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(cook)
        self.assertEqual(c.get('/api/cookbook/modifier-readiness/').status_code, 403)


class AuditCommandTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name_en='WnR', sort_order=1)
        u = UnitScale.objects.create(code='g', description='g', dimension='mass', factor_to_canonical=1)
        base = DishRecipe.objects.create(name_en='Edamame', recipe_code='E1',
                                         branch_ref=self.branch, pos_item_name='Edamame')
        DishRecipeIngredient.objects.create(recipe=base, order=1, item_sku='EDA',
                                            item_name_snapshot='Edamame', quantity=Decimal('150'), unit=u)
        mongolian = DishRecipe.objects.create(name_en='Mongolian', recipe_code='M1',
                                              branch_ref=self.branch, pos_item_name='Mongolian')
        DishRecipeIngredient.objects.create(recipe=mongolian, order=1, item_sku='SAU',
                                            item_name_snapshot='Sauce', quantity=Decimal('50'), unit=u)
        g = ModifierGroup.objects.create(name_en='Protein')
        beef = ModifierOption.objects.create(group=g, name_en='Beef', kind='type', pos_mods_string='Beef')
        ModifierOptionIngredient.objects.create(option=beef, item_sku='BEEF', quantity=Decimal('180'),
                                                unit=u, direction='add')
        ModifierOption.objects.create(group=g, name_en='Chicken', kind='type', pos_mods_string='Chicken')
        DishModifierGroup.objects.create(dish=mongolian, group=g, default_role='forced')

    def _report(self):
        rows = [
            'Quantity\tItem\tMods\tID\tCategory\tItem Total\tModifiers\tTotal',
            '3\tEdamame\t\t1\tApp\t4.500\t0\t4.500',
            '9\tMongolian\tBeef\t2\tMain\t0\t58.500\t58.500',
            '2\tMongolian\tChicken\t3\tMain\t0\t10.900\t10.900',
            '1\tGhost Dish\t\t4\tMain\t3.000\t0\t3.000',
        ]
        f = tempfile.NamedTemporaryFile(mode='wb', suffix='.xls', delete=False)
        f.write('\n'.join(rows).encode('utf-16'))
        f.close()
        return f.name

    def test_audit_buckets(self):
        out = io.StringIO()
        call_command('audit_modifier_coverage', self._report(), '--branch', 'WnR', stdout=out)
        text = out.getvalue()
        self.assertIn('OK - base', text)                              # Edamame
        self.assertIn('OK - modifier effect defined', text)           # Mongolian [Beef]
        self.assertIn('NEEDS DATA', text)                             # Mongolian [Chicken] - no deltas
        self.assertIn('Ghost Dish', text)                             # unmatched base -> flagged, not silent
