"""
Per-brand category / section lists (MenuCategory.branches, Section.branches).

A brand with its own list may only use that list; a brand without one uses
the unassigned items. Enforced by the dish write serializer, but only when the
value is new or the brand moved, so dishes saved before a list existed stay
editable. Migration 0034 seeds Sando's list.
"""
import importlib
from decimal import Decimal

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import Branch, DishRecipe, MenuCategory, Section
from apps.cookbook.models.reference import brand_options

User = get_user_model()
URL = '/api/cookbook/dish-recipes/'


class BrandListTests(APITestCase):
    def setUp(self):
        self.sando = Branch.objects.get_or_create(slug='sando', defaults={'name_en': 'Sando'})[0]
        self.wnr = Branch.objects.get_or_create(slug='wnr-test', defaults={'name_en': 'WnR test'})[0]
        self.burger = MenuCategory.objects.create(name='Burger X', sort_order=1)
        self.burger.branches.add(self.sando)
        self.mains = MenuCategory.objects.create(name='Mains X', sort_order=2)       # unassigned
        self.sandwich = Section.objects.create(name='Sandwich X')
        self.sandwich.branches.add(self.sando)
        self.grill = Section.objects.create(name='Grill X')                          # unassigned
        admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(admin)

    def _create(self, branch, category, section):
        return self.client.post(URL, {
            'name_en': 'Test dish', 'branch_ref': str(branch.id),
            'category': str(category.id), 'section': str(section.id),
            'ingredients': [], 'steps': [],
        }, format='json')

    def test_brand_options_rule(self):
        self.assertIn(self.burger, brand_options(MenuCategory, self.sando))
        self.assertNotIn(self.mains, brand_options(MenuCategory, self.sando))
        self.assertIn(self.mains, brand_options(MenuCategory, self.wnr))
        self.assertNotIn(self.burger, brand_options(MenuCategory, self.wnr))

    def test_reference_api_exposes_branch_ids(self):
        rows = {r['name']: r for r in self.client.get('/api/cookbook/reference/categories/').data}
        self.assertEqual(rows['Burger X']['branch_ids'], [self.sando.id])
        self.assertEqual(rows['Mains X']['branch_ids'], [])

    def test_sando_dish_must_use_sando_lists(self):
        self.assertEqual(self._create(self.sando, self.burger, self.sandwich).status_code, 201)
        r = self._create(self.sando, self.mains, self.grill)
        self.assertEqual(r.status_code, 400)
        self.assertIn('Sando', str(r.data['category']))
        self.assertIn('section', r.data)

    def test_other_brands_keep_the_unassigned_lists(self):
        self.assertEqual(self._create(self.wnr, self.mains, self.grill).status_code, 201)
        self.assertEqual(self._create(self.wnr, self.burger, self.sandwich).status_code, 400)

    def test_dish_saved_before_the_list_stays_editable(self):
        dish = DishRecipe.objects.create(name_en='Old', branch_ref=self.sando, category=self.mains,
                                         section=self.grill, cost=Decimal('0'))
        r = self.client.patch(f'{URL}{dish.id}/', {
            'category': str(self.mains.id), 'notes': 'still fine'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)


class SandoSeedMigrationTests(APITestCase):
    def test_seed_is_idempotent_and_links_existing_sections(self):
        Branch.objects.get_or_create(slug='sando', defaults={'name_en': 'Sando'})
        Section.objects.get_or_create(name='Kitchen Manager')
        seed = importlib.import_module('apps.cookbook.migrations.0034_sando_categories_sections')
        seed.forwards(django_apps, None)
        seed.forwards(django_apps, None)          # twice: no duplicates

        sando = Branch.objects.get(slug='sando')
        cats = list(sando.menu_categories.order_by('sort_order').values_list('name', 'name_ar'))
        self.assertEqual(len(cats), 16)
        self.assertEqual(cats[0], ('Starters', 'المقبـــلات'))
        self.assertEqual(sando.sections.count(), 23)
        self.assertEqual(Section.objects.filter(name__iexact='kitchen manager').count(), 1)
