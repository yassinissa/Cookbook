"""
Specials calendar — feature 4b: published editions + the public QR / print menu.

Pins the publish flow (versioning, is_current), the QR endpoint, the
`menu.publish` gate, and — the point of the security review — that the public
payload can never carry a cost / margin / supplier field.
"""
import json
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import (
    Allergen, Branch, DishRecipe, Menu, MenuCategory, MenuEdition, MenuLine,
    MenuPeriod, MenuPeriodLine,
)

User = get_user_model()

# any of these appearing anywhere in the public payload is a leak
FORBIDDEN_KEYS = {
    'cost', 'cost_breakdown', 'food_cost_pct', 'labor_cost', 'labour_cost',
    'selling_price', 'recipe_code', 'recipe_cost', 'supplier', 'suppliers',
    'unit_cost', 'order_cost', 'margin', 'pos_name',
}


def walk_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from walk_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_keys(v)


class PublishFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.branch = Branch.objects.create(name_en='Dine', name_ar='داين', code='DINE', sort_order=1)
        self.cat = MenuCategory.objects.create(name='Mains', menu_title_ar='رئيسية', sort_order=1)
        self.menu = Menu.objects.create(branch=self.branch, name='Dine Menu', is_active=True)
        self.nuts = Allergen.objects.create(name='Nuts')

        self.tikka = DishRecipe.objects.create(
            name_en='Meat Tikka', name_ar='تكة لحم', recipe_code='TIK',
            branch='Dine', branch_ref=self.branch, category=self.cat,
            selling_price=Decimal('3.500'), cost=Decimal('1.100'),
            pos_item_name='TIKKA', nutrition={'calories': '620.4', '_coverage': {'covered': 5, 'total': 6}},
        )
        self.tikka.allergens.add(self.nuts)
        self.salad = DishRecipe.objects.create(
            name_en='Fattoush', recipe_code='FAT', branch='Dine', branch_ref=self.branch,
            category=self.cat, selling_price=Decimal('1.800'), cost=Decimal('0.400'),
        )
        MenuLine.objects.create(menu=self.menu, dish=self.tikka, sort_order=1,
                                menu_description_en='Chargrilled, sumac onions')
        MenuLine.objects.create(menu=self.menu, dish=self.salad, sort_order=2, is_available=False)

        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def _publish(self, on='2026-06-01'):
        return self.client.post(f'/api/cookbook/menus/{self.menu.id}/publish-edition/',
                                {'effective_on': on}, format='json')

    def test_publish_creates_edition_and_versions(self):
        r = self._publish()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['version'], 1)
        self.assertTrue(r.data['is_current'])

        r2 = self._publish('2026-07-01')
        self.assertEqual(r2.data['version'], 2)
        self.assertEqual(MenuEdition.objects.filter(menu=self.menu, is_current=True).count(), 1)
        self.assertEqual(MenuEdition.objects.get(version=1).is_current, False)

    def test_payload_shape(self):
        self._publish()
        payload = MenuEdition.objects.get(menu=self.menu, version=1).payload
        self.assertEqual(payload['branch'], {'name_en': 'Dine', 'name_ar': 'داين', 'slug': 'dine'})
        self.assertEqual(payload['effective_on'], '2026-06-01')
        # the unavailable salad line is dropped
        self.assertEqual(payload['item_count'], 1)
        item = payload['categories'][0]['items'][0]
        self.assertEqual(item['name_en'], 'Meat Tikka')
        self.assertEqual(item['description_en'], 'Chargrilled, sumac onions')
        self.assertEqual(item['price'], '3.500')
        self.assertEqual(item['allergens'], ['Nuts'])
        self.assertEqual(item['calories'], 620)

    def test_payload_has_no_cost_fields(self):
        # add a period reprice too, so the resolver path is exercised
        p = MenuPeriod.objects.create(menu=self.menu, kind='event', name_en='NYE', starts_on=date(2026, 6, 1))
        MenuPeriodLine.objects.create(period=p, dish=self.tikka, op='reprice', menu_price=Decimal('2.900'))
        self._publish()
        payload = MenuEdition.objects.get(menu=self.menu, version=1).payload
        leaked = FORBIDDEN_KEYS & set(walk_keys(payload))
        self.assertEqual(leaked, set(), f'cost data leaked into the public payload: {leaked}')
        # and no raw numbers that look like the cost
        blob = json.dumps(payload)
        self.assertNotIn('1.100', blob)
        self.assertNotIn('0.400', blob)

    def test_publish_requires_menu_publish_capability(self):
        chef = User.objects.create_user('cook', password='x')
        chef.profile.role = Role.objects.get(name='QA Manager')   # menu.view only, no publish
        chef.profile.save()
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(chef)
        r = c.post(f'/api/cookbook/menus/{self.menu.id}/publish-edition/', {}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_qr_endpoint_is_public_png(self):
        r = APIClient().get(f'/api/cookbook/public-menu/{self.branch.slug}/qr/')   # no auth
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'image/png')
        self.assertTrue(r.content.startswith(b'\x89PNG'))
        self.assertEqual(
            APIClient().get('/api/cookbook/public-menu/nope/qr/').status_code, 404)

    def test_editions_list(self):
        self._publish('2026-06-01')
        self._publish('2026-06-08')
        r = self.client.get(f'/api/cookbook/menus/{self.menu.id}/editions/')
        self.assertEqual([e['version'] for e in r.data], [2, 1])


class PublicMenuEndpointTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.branch = Branch.objects.create(name_en='Luma', code='LUMA', sort_order=1)
        self.cat = MenuCategory.objects.create(name='Mezze', sort_order=1)
        self.menu = Menu.objects.create(branch=self.branch, name='Luma Menu', is_active=True)
        d = DishRecipe.objects.create(name_en='Hummus', recipe_code='HUM', branch='Luma',
                                      branch_ref=self.branch, category=self.cat, selling_price=Decimal('2.200'))
        MenuLine.objects.create(menu=self.menu, dish=d, sort_order=1)
        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.auth = APIClient(HTTP_ACCEPT='application/json')
        self.auth.force_authenticate(self.admin)

    def test_unpublished_menu_is_404(self):
        r = APIClient().get(f'/api/cookbook/public-menu/{self.branch.slug}/')
        self.assertEqual(r.status_code, 404)

    def test_unknown_slug_is_404(self):
        self.assertEqual(APIClient().get('/api/cookbook/public-menu/no-such-branch/').status_code, 404)

    def test_published_menu_is_public_and_cached(self):
        self.auth.post(f'/api/cookbook/menus/{self.menu.id}/publish-edition/',
                       {'effective_on': '2026-06-01'}, format='json')
        anon = APIClient()                       # no auth header at all
        r = anon.get(f'/api/cookbook/public-menu/{self.branch.slug}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['branch']['slug'], 'luma')
        self.assertEqual(r.data['categories'][0]['items'][0]['name_en'], 'Hummus')

        # a re-publish busts the cache — the new payload is served
        MenuLine.objects.filter(menu=self.menu).update(menu_price=Decimal('2.500'))
        self.auth.post(f'/api/cookbook/menus/{self.menu.id}/publish-edition/',
                       {'effective_on': '2026-06-02'}, format='json')
        r2 = APIClient().get(f'/api/cookbook/public-menu/{self.branch.slug}/')
        self.assertEqual(r2.data['categories'][0]['items'][0]['price'], '2.500')

    def test_public_payload_never_has_cost(self):
        self.auth.post(f'/api/cookbook/menus/{self.menu.id}/publish-edition/',
                       {'effective_on': '2026-06-01'}, format='json')
        r = APIClient().get(f'/api/cookbook/public-menu/{self.branch.slug}/')
        self.assertEqual(FORBIDDEN_KEYS & set(walk_keys(r.data)), set())
