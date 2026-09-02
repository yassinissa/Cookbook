"""
POS modifier API — the group/option catalogue (`modifier-groups/`) and the
dish-id-addressed attachment (`dish-modifiers/`).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import (
    Branch, DishRecipe, MenuCategory, ModifierGroup, ModifierOption,
    ModifierOptionKind, ModifierRole, DishModifierGroup,
)

User = get_user_model()


class ModifierGroupApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def _create(self, **over):
        body = {
            'name_en': 'RoLL', 'selection': 'single', 'min_select': 1, 'max_select': 1,
            'options': [
                {'name_en': 'Chicken', 'name_ar': 'دجاج', 'price_delta': '5.450', 'kind': 'type'},
                {'name_en': 'Garlic Sauce', 'price_delta': '0.250', 'kind': 'addon',
                 'item_sku': 'B999', 'quantity': '10'},
            ],
        }
        body.update(over)
        return self.client.post('/api/cookbook/modifier-groups/', body, format='json')

    def test_create_with_nested_options(self):
        r = self._create()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['option_count'], 2)
        gid = r.data['id']
        opts = {o['name_en']: o for o in r.data['options']}
        self.assertEqual(opts['Chicken']['kind'], 'type')
        self.assertEqual(opts['Garlic Sauce']['item_sku'], 'B999')

        # patch: keep Chicken (by id), drop Garlic Sauce, add Lamb
        keep = opts['Chicken']['id']
        p = self.client.patch(f'/api/cookbook/modifier-groups/{gid}/', {
            'options': [
                {'id': keep, 'name_en': 'Chicken', 'price_delta': '5.900', 'kind': 'type'},
                {'name_en': 'Lamb', 'price_delta': '6.700', 'kind': 'type'},
            ],
        }, format='json')
        self.assertEqual(p.status_code, 200, p.data)
        self.assertEqual(p.data['option_count'], 2)
        self.assertEqual(
            set(ModifierOption.objects.filter(group_id=gid).values_list('name_en', flat=True)),
            {'Chicken', 'Lamb'})
        self.assertEqual(ModifierOption.objects.get(group_id=gid, name_en='Chicken').price_delta,
                         Decimal('5.900'))

    def test_addon_needs_a_sku(self):
        r = self._create(options=[{'name_en': 'Extra Cheese', 'price_delta': '1.0', 'kind': 'addon'}])
        self.assertEqual(r.status_code, 400)
        self.assertIn('item_sku', r.data['options'][0])

    def test_min_max_validation(self):
        self.assertEqual(self._create(min_select=3, max_select=2).status_code, 400)

    def test_pos_manage_gate(self):
        cook = User.objects.create_user('cook', password='x')
        cook.profile.role = Role.objects.get(name='Restaurant Cook')   # no pos.manage
        cook.profile.save()
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(cook)
        self.assertEqual(c.get('/api/cookbook/modifier-groups/').status_code, 403)
        self.assertEqual(
            c.post('/api/cookbook/modifier-groups/', {'name_en': 'X'}, format='json').status_code, 403)


class DishModifierApiTests(APITestCase):
    def setUp(self):
        self.dine = Branch.objects.create(name_en='Dine', code='DINE', sort_order=1)
        self.luma = Branch.objects.create(name_en='Luma', code='LUMA', sort_order=2)
        self.cat = MenuCategory.objects.create(name='Grill', sort_order=1)
        self.tikka = DishRecipe.objects.create(
            name_en='Meat Tikka', recipe_code='TIK', branch='Dine', branch_ref=self.dine,
            category=self.cat, pos_item_name='Meat Tikka', selling_price=Decimal('3.5'))
        self.old_tikka = DishRecipe.objects.create(
            name_en='Meat Tikka', recipe_code='TIK', branch='Dine', branch_ref=self.dine,
            is_current=False, version=1)
        self.luma_dish = DishRecipe.objects.create(
            name_en='Luma Fattoush', recipe_code='LF', branch='Luma', branch_ref=self.luma,
            category=self.cat, selling_price=Decimal('4.0'))
        self.roll = ModifierGroup.objects.create(name_en='RoLL', selection='single', min_select=1)
        self.sauce = ModifierGroup.objects.create(name_en='Sauce', selection='multi')

        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_list_is_one_row_per_current_dish(self):
        r = self.client.get('/api/cookbook/dish-modifiers/')
        names = sorted(d['name_en'] for d in r.data)
        self.assertEqual(names, ['Luma Fattoush', 'Meat Tikka'])   # not the archived version
        row = next(d for d in r.data if d['name_en'] == 'Meat Tikka')
        self.assertEqual((row['group_count'], row['forced_count']), (0, 0))

    def test_patch_upserts_the_group_set(self):
        v_before = self.tikka.version
        r = self.client.patch(f'/api/cookbook/dish-modifiers/{self.tikka.id}/', {
            'groups': [
                {'group': str(self.roll.id), 'default_role': 'forced'},
                {'group': str(self.sauce.id), 'default_role': 'optional', 'sort_order': 1},
            ],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data['modifier_groups']), 2)
        self.assertEqual(DishModifierGroup.objects.filter(dish=self.tikka).count(), 2)
        self.tikka.refresh_from_db()
        self.assertEqual(self.tikka.version, v_before)   # never versioned

        # replace: keep only Sauce, now forced
        r2 = self.client.patch(f'/api/cookbook/dish-modifiers/{self.tikka.id}/', {
            'groups': [{'group': str(self.sauce.id), 'default_role': 'forced'}],
        }, format='json')
        self.assertEqual(r2.status_code, 200)
        rows = DishModifierGroup.objects.filter(dish=self.tikka)
        self.assertEqual([(r.group.name_en, r.default_role) for r in rows], [('Sauce', 'forced')])

    def test_patch_rejects_unknown_group_and_dupes(self):
        self.assertEqual(self.client.patch(
            f'/api/cookbook/dish-modifiers/{self.tikka.id}/',
            {'groups': [{'group': '00000000-0000-0000-0000-000000000000'}]},
            format='json').status_code, 400)
        self.assertEqual(self.client.patch(
            f'/api/cookbook/dish-modifiers/{self.tikka.id}/',
            {'groups': [{'group': str(self.roll.id)}, {'group': str(self.roll.id)}]},
            format='json').status_code, 400)

    def test_branch_scope(self):
        cook = User.objects.create_user('cook', password='x')
        cook.profile.role = Role.objects.get(name='Executive Chef')
        cook.profile.scope_overridden = True
        cook.profile.save()
        cook.profile.branches.set([self.dine])
        # Executive Chef lacks pos.manage → 403 regardless
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(cook)
        self.assertEqual(c.get('/api/cookbook/dish-modifiers/').status_code, 403)

        cook.profile.extra_capabilities.set([Capability.objects.get(code='pos.manage')])
        got = c.get('/api/cookbook/dish-modifiers/')
        self.assertEqual(got.status_code, 200)
        self.assertEqual([d['name_en'] for d in got.data], ['Meat Tikka'])   # Dine only
        self.assertEqual(
            c.patch(f'/api/cookbook/dish-modifiers/{self.luma_dish.id}/',
                    {'groups': []}, format='json').status_code, 404)
