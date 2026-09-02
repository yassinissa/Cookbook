"""
Specials calendar — the MenuPeriod resolver and its authoring API.

The resolver (apps.cookbook.specials.resolve_menu) is the one piece of real
logic: apply every period active on a date, in precedence order, to the base
menu. These pin op application, precedence, the weekday mask, date boundaries,
the draft flag, and the nested-line write path + validation + branch scope.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import (
    Branch, DishRecipe, Menu, MenuCategory, MenuLine, MenuPeriod, MenuPeriodLine,
)
from apps.cookbook.specials import resolve_menu

User = get_user_model()

MON = date(2026, 6, 1)   # a Monday
FRI = date(2026, 6, 5)   # that week's Friday


def names(resolved):
    return [i['name_en'] for c in resolved['categories'] for i in c['items']]


def line(resolved, name):
    for c in resolved['categories']:
        for i in c['items']:
            if i['name_en'] == name:
                return i
    return None


class ResolverTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name_en='Dine', code='DINE', sort_order=1)
        self.mains = MenuCategory.objects.create(name='Mains', sort_order=1)
        self.menu = Menu.objects.create(branch=self.branch, name='Dine Menu', is_active=True)
        self.tikka = self._dish('Meat Tikka', '3.000')
        self.tabbouleh = self._dish('Tabbouleh', '1.500')
        MenuLine.objects.create(menu=self.menu, dish=self.tikka, sort_order=1)
        MenuLine.objects.create(menu=self.menu, dish=self.tabbouleh, menu_price=Decimal('1.800'), sort_order=2)

    def _dish(self, name, price):
        return DishRecipe.objects.create(
            name_en=name, recipe_code=name[:3].upper(), branch='Dine', branch_ref=self.branch,
            category=self.mains, selling_price=Decimal(price),
        )

    def _period(self, kind, **kw):
        kw.setdefault('starts_on', MON)
        kw.setdefault('name_en', kind.title())
        return MenuPeriod.objects.create(menu=self.menu, kind=kind, **kw)

    def test_base_menu_passes_through(self):
        r = resolve_menu(self.menu, MON)
        self.assertEqual(names(r), ['Meat Tikka', 'Tabbouleh'])
        self.assertEqual(line(r, 'Meat Tikka')['price'], '3.000')          # falls back to selling_price
        self.assertEqual(line(r, 'Tabbouleh')['price'], '1.800')           # menu_price override
        self.assertEqual(line(r, 'Meat Tikka')['source'], 'base')
        self.assertEqual(r['periods'], [])

    def test_add_and_remove_ops(self):
        special = self._dish('Grilled Halloumi', '2.400')
        p = self._period('event', name_en="Founder's Day")
        MenuPeriodLine.objects.create(period=p, dish=special, op='add', menu_price=Decimal('2.900'))
        MenuPeriodLine.objects.create(period=p, dish=self.tabbouleh, op='remove')

        r = resolve_menu(self.menu, MON)
        self.assertEqual(names(r), ['Meat Tikka', 'Grilled Halloumi'])
        self.assertEqual(line(r, 'Grilled Halloumi')['price'], '2.900')
        self.assertEqual(line(r, 'Grilled Halloumi')['source'], 'event')
        self.assertEqual([p['name_en'] for p in r['periods']], ["Founder's Day"])

    def test_reprice_and_replace_copy(self):
        p = self._period('seasonal')
        MenuPeriodLine.objects.create(period=p, dish=self.tikka, op='reprice', menu_price=Decimal('3.500'))
        MenuPeriodLine.objects.create(period=p, dish=self.tikka, op='replace_copy',
                                      description_en='Now with sumac onions')
        r = resolve_menu(self.menu, MON)
        self.assertEqual(line(r, 'Meat Tikka')['price'], '3.500')
        self.assertEqual(line(r, 'Meat Tikka')['description_en'], 'Now with sumac onions')
        self.assertEqual(line(r, 'Meat Tikka')['source'], 'seasonal')

    def test_precedence_event_beats_seasonal(self):
        seasonal = self._period('seasonal')
        MenuPeriodLine.objects.create(period=seasonal, dish=self.tikka, op='reprice',
                                      menu_price=Decimal('3.200'))
        event = self._period('event', name_en='NYE')
        MenuPeriodLine.objects.create(period=event, dish=self.tikka, op='reprice',
                                      menu_price=Decimal('4.000'))
        r = resolve_menu(self.menu, MON)
        self.assertEqual(line(r, 'Meat Tikka')['price'], '4.000')   # event applied last, wins

    def test_weekday_mask_confines_a_recurring_special(self):
        p = self._period('daily_special', name_en='Friday feast',
                         weekday_mask=1 << FRI.weekday())
        MenuPeriodLine.objects.create(period=p, dish=self.tikka, op='reprice',
                                      menu_price=Decimal('2.500'))
        self.assertEqual(line(resolve_menu(self.menu, FRI), 'Meat Tikka')['price'], '2.500')
        self.assertEqual(line(resolve_menu(self.menu, MON), 'Meat Tikka')['price'], '3.000')

    def test_date_boundaries(self):
        p = self._period('seasonal', starts_on=MON, ends_on=MON + timedelta(days=6))
        MenuPeriodLine.objects.create(period=p, dish=self.tikka, op='reprice',
                                      menu_price=Decimal('2.750'))
        self.assertEqual(line(resolve_menu(self.menu, MON), 'Meat Tikka')['price'], '2.750')
        self.assertEqual(line(resolve_menu(self.menu, MON - timedelta(days=1)), 'Meat Tikka')['price'], '3.000')
        self.assertEqual(line(resolve_menu(self.menu, MON + timedelta(days=7)), 'Meat Tikka')['price'], '3.000')

    def test_draft_period_is_ignored(self):
        p = self._period('event', name_en='Draft', is_live=False)
        MenuPeriodLine.objects.create(period=p, dish=self.tabbouleh, op='remove')
        self.assertEqual(names(resolve_menu(self.menu, MON)), ['Meat Tikka', 'Tabbouleh'])


class MenuPeriodApiTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name_en='Dine', code='DINE', sort_order=1)
        self.other = Branch.objects.create(name_en='Luma', code='LUMA', sort_order=2)
        self.cat = MenuCategory.objects.create(name='Mains', sort_order=1)
        self.menu = Menu.objects.create(branch=self.branch, name='Dine Menu', is_active=True)
        self.luma_menu = Menu.objects.create(branch=self.other, name='Luma Menu', is_active=True)
        self.tikka = DishRecipe.objects.create(name_en='Meat Tikka', recipe_code='TIK',
                                               branch='Dine', branch_ref=self.branch, category=self.cat,
                                               selling_price=Decimal('3.000'))
        self.halloumi = DishRecipe.objects.create(name_en='Halloumi', recipe_code='HAL',
                                                  branch='Dine', branch_ref=self.branch, category=self.cat,
                                                  selling_price=Decimal('2.400'))
        MenuLine.objects.create(menu=self.menu, dish=self.tikka, sort_order=1)

        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def _create(self, **over):
        body = {
            'menu': str(self.menu.id), 'kind': 'event', 'name_en': 'Eid',
            'starts_on': '2026-06-01', 'ends_on': '2026-06-03',
            'lines': [{'dish': str(self.halloumi.id), 'op': 'add', 'menu_price': '2.900'}],
        }
        body.update(over)
        return self.client.post('/api/cookbook/menu-periods/', body, format='json')

    def test_create_list_patch_delete(self):
        r = self._create()
        self.assertEqual(r.status_code, 201, r.data)
        pid = r.data['id']
        self.assertEqual(r.data['line_count'], 1)
        self.assertEqual(r.data['kind_display'], 'Event')

        lst = self.client.get(f'/api/cookbook/menu-periods/?menu={self.menu.id}')
        self.assertEqual(len(lst.data), 1)

        # patch: keep the add line (by id), append a remove line
        keep = r.data['lines'][0]['id']
        patch = self.client.patch(f'/api/cookbook/menu-periods/{pid}/', {
            'lines': [
                {'id': keep, 'dish': str(self.halloumi.id), 'op': 'add', 'menu_price': '3.100'},
                {'dish': str(self.tikka.id), 'op': 'remove'},
            ],
        }, format='json')
        self.assertEqual(patch.status_code, 200, patch.data)
        self.assertEqual(patch.data['line_count'], 2)
        self.assertEqual(MenuPeriodLine.objects.filter(period_id=pid).count(), 2)

        self.assertEqual(self.client.delete(f'/api/cookbook/menu-periods/{pid}/').status_code, 204)
        self.assertFalse(MenuPeriod.objects.filter(id=pid).exists())

    def test_validation(self):
        self.assertEqual(self._create(ends_on='2026-05-01').status_code, 400)          # ends < starts
        self.assertEqual(self._create(weekday_mask=0).status_code, 400)                 # no weekdays
        bad_line = self._create(lines=[{'dish': str(self.tikka.id), 'op': 'reprice'}])  # reprice, no price
        self.assertEqual(bad_line.status_code, 400)

    def test_branch_scope_blocks_other_menu(self):
        cook = User.objects.create_user('cook', password='x')
        cook.profile.role = Role.objects.get(name='Executive Chef')
        cook.profile.scope_overridden = True
        cook.profile.save()
        cook.profile.branches.set([self.branch])
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(cook)
        r = c.post('/api/cookbook/menu-periods/', {
            'menu': str(self.luma_menu.id), 'kind': 'event', 'name_en': 'x',
            'starts_on': '2026-06-01',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_effective_endpoint(self):
        self._create(lines=[{'dish': str(self.halloumi.id), 'op': 'add', 'menu_price': '2.900'}])
        r = self.client.get(f'/api/cookbook/menus/{self.menu.id}/effective/?on=2026-06-02')
        self.assertEqual(r.status_code, 200)
        got = [i['name_en'] for c in r.data['categories'] for i in c['items']]
        self.assertEqual(sorted(got), ['Halloumi', 'Meat Tikka'])
        self.assertEqual(r.data['periods'][0]['name_en'], 'Eid')

        # outside the window → base menu only
        base = self.client.get(f'/api/cookbook/menus/{self.menu.id}/effective/?on=2026-07-01')
        got = [i['name_en'] for c in base.data['categories'] for i in c['items']]
        self.assertEqual(got, ['Meat Tikka'])

    def test_effective_bad_date(self):
        self.assertEqual(
            self.client.get(f'/api/cookbook/menus/{self.menu.id}/effective/?on=nope').status_code, 400)
