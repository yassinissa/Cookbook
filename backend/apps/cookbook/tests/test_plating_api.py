"""
Standalone plating-guide API: list shows every current dish (with a gap
flag), upsert doesn't version the recipe, photos are managed inline by id
(kept / added / dropped), pins are normalised, and the scope / capability
gates match the QA-standards API.
"""
import shutil
import tempfile
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import (
    Branch, DishRecipe, MenuCategory, PlatingGuide, PlatingImage, Section,
    DishRecipeActivityLog,
)

User = get_user_model()

# 1x1 transparent PNG
PNG = ('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA'
       'DUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')

_MEDIA = tempfile.mkdtemp()


def make_dish(name, code, branch=None):
    return DishRecipe.objects.create(
        name_en=name, recipe_code=code,
        branch=branch.name_en if branch else '', branch_ref=branch,
        selling_price=Decimal('3.000'), cost=Decimal('0.800'),
    )


@override_settings(MEDIA_ROOT=_MEDIA)
class PlatingApiTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.category = MenuCategory.objects.create(name='Salad')
        self.with_guide = make_dish('Tabbouleh', 'T1')
        PlatingGuide.objects.create(
            dish_recipe=self.with_guide, plate_spec='28 cm coupe, chilled',
            garnish_spec_en='Mint tip, centre', pickup_window_seconds=90,
        )
        self.no_guide = make_dish('Muhammara', 'M1')

        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_list_is_one_row_per_dish_with_gap_flag(self):
        resp = self.client.get('/api/cookbook/plating-guides/')
        self.assertEqual(resp.status_code, 200)
        rows = {r['name_en']: r for r in resp.data['results']}
        self.assertEqual(set(rows), {'Tabbouleh', 'Muhammara'})
        self.assertTrue(rows['Tabbouleh']['has_plating'])
        self.assertEqual(rows['Tabbouleh']['pickup_window_seconds'], 90)
        self.assertFalse(rows['Muhammara']['has_plating'])
        self.assertEqual(rows['Muhammara']['pin_count'], 0)

    def test_retrieve_returns_guide_or_null(self):
        d = self.client.get(f'/api/cookbook/plating-guides/{self.with_guide.id}/')
        self.assertEqual(d.status_code, 200)
        self.assertEqual(d.data['plating']['plate_spec'], '28 cm coupe, chilled')

        empty = self.client.get(f'/api/cookbook/plating-guides/{self.no_guide.id}/')
        self.assertIsNone(empty.data['plating'])

    def test_upsert_creates_without_versioning_the_recipe(self):
        before = self.no_guide.version
        create = self.client.patch(
            f'/api/cookbook/plating-guides/{self.no_guide.id}/',
            {'plate_spec': 'Slate board', 'pickup_window_seconds': '',
             'build_notes_en': 'Dip left, oil well centre'},
            format='json',
        )
        self.assertEqual(create.status_code, 201, create.data)
        self.no_guide.refresh_from_db()
        self.assertEqual(self.no_guide.version, before)
        self.assertEqual(DishRecipe.objects.count(), 2)          # no archived copy
        g = PlatingGuide.objects.get(dish_recipe=self.no_guide)
        self.assertEqual(g.plate_spec, 'Slate board')
        self.assertIsNone(g.pickup_window_seconds)               # '' -> NULL
        self.assertEqual(
            DishRecipeActivityLog.objects.filter(
                recipe=self.no_guide, action_type='plating_updated').count(), 1)

    def test_photos_are_added_kept_and_dropped_by_id(self):
        url = f'/api/cookbook/plating-guides/{self.with_guide.id}/'
        # add two photos
        r = self.client.patch(url, {'images': [
            {'image_data': PNG, 'caption_en': 'Hero', 'pins': [
                {'x': 0.4, 'y': 0.3, 'label_en': 'Mint tip'},
                {'x': 1.4, 'y': -0.2, 'label_en': 'clamped'},
            ]},
            {'image_data': PNG, 'caption_en': 'Side'},
        ]}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        imgs = r.data['plating']['images']
        self.assertEqual(len(imgs), 2)
        self.assertEqual(imgs[0]['sort_order'], 0)
        # pins normalised + clamped, n auto-assigned
        pins = imgs[0]['pins']
        self.assertEqual(pins[0], {'n': 1, 'x': 0.4, 'y': 0.3, 'label_en': 'Mint tip', 'label_ar': ''})
        self.assertEqual((pins[1]['x'], pins[1]['y']), (1.0, 0.0))
        self.assertEqual(PlatingImage.objects.filter(guide__dish_recipe=self.with_guide).count(), 2)

        keep_id = imgs[1]['id']
        # keep only the 2nd (by id, new caption), drop the 1st
        r2 = self.client.patch(url, {'images': [
            {'id': keep_id, 'caption_en': 'Now the hero'},
        ]}, format='json')
        self.assertEqual(r2.status_code, 200, r2.data)
        left = r2.data['plating']['images']
        self.assertEqual(len(left), 1)
        self.assertEqual(left[0]['id'], keep_id)
        self.assertEqual(left[0]['caption_en'], 'Now the hero')
        self.assertEqual(PlatingImage.objects.filter(guide__dish_recipe=self.with_guide).count(), 1)

    def test_photo_entry_without_id_or_data_is_400(self):
        r = self.client.patch(
            f'/api/cookbook/plating-guides/{self.with_guide.id}/',
            {'images': [{'caption_en': 'orphan'}]}, format='json',
        )
        self.assertEqual(r.status_code, 400)


@override_settings(MEDIA_ROOT=_MEDIA)
class PlatingScopeTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.salmiya = Branch.objects.create(name_en='Salmiya', code='SLM', sort_order=1)
        self.jabriya = Branch.objects.create(name_en='Jabriya', code='JBR', sort_order=2)
        self.sal_dish = make_dish('Salmiya Tabbouleh', 'S1', branch=self.salmiya)
        self.jab_dish = make_dish('Jabriya Tabbouleh', 'J1', branch=self.jabriya)

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

    def test_branch_scoped_user_is_filtered(self):
        c = self.api(self._user('Restaurant Cook', branches=[self.salmiya], extra=['standard.view']))
        resp = c.get('/api/cookbook/plating-guides/')
        self.assertEqual({r['name_en'] for r in resp.data['results']}, {'Salmiya Tabbouleh'})
        self.assertEqual(c.get(f'/api/cookbook/plating-guides/{self.jab_dish.id}/').status_code, 404)

    def test_standard_edit_capability_required_for_patch(self):
        c = self.api(self._user('Restaurant Cook', branches=[self.salmiya], extra=['standard.view']))
        self.assertEqual(
            c.patch(f'/api/cookbook/plating-guides/{self.sal_dish.id}/',
                    {'plate_spec': 'x'}, format='json').status_code, 403)

        c2 = self.api(self._user('QA Manager'))   # has standard.edit
        self.assertEqual(
            c2.patch(f'/api/cookbook/plating-guides/{self.sal_dish.id}/',
                     {'plate_spec': 'Bowl'}, format='json').status_code, 201)
