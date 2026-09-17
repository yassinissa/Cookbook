"""
PrepKitchen mirrors Branch: it's the one other reference-data model with an
in-product create/edit screen — production recipe publish sends
PrepKitchen.inventory_store_id to inventory-platform as the prep-kitchen
join key (see apps.cookbook.publishing), so getting a new prep kitchen set
up correctly matters more than the rest of reference data (which stays
Django-admin-only). Gated by `admin.prep_kitchens`.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import PrepKitchen

User = get_user_model()


class PrepKitchenApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.admin_client = APIClient(HTTP_ACCEPT='application/json')
        self.admin_client.force_authenticate(self.admin)

        cook = User.objects.create_user('cook', password='x')
        p = cook.profile
        p.role = Role.objects.get(name='Prep Cook')
        p.scope_overridden = True
        p.save()
        p.extra_capabilities.set(Capability.objects.filter(code='production.view'))
        self.cook_client = APIClient(HTTP_ACCEPT='application/json')
        self.cook_client.force_authenticate(cook)

    def test_any_authenticated_user_can_list_prep_kitchens(self):
        PrepKitchen.objects.create(name_en='Central Bakery')
        r = self.cook_client.get('/api/cookbook/reference/prep-kitchens/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(any(k['name_en'] == 'Central Bakery' for k in r.data))

    def test_user_without_capability_cannot_create_prep_kitchen(self):
        r = self.cook_client.post('/api/cookbook/reference/prep-kitchens/', {'name_en': 'New Kitchen'})
        self.assertEqual(r.status_code, 403)

    def test_admin_can_create_prep_kitchen_with_inventory_store_id(self):
        r = self.admin_client.post('/api/cookbook/reference/prep-kitchens/', {
            'name_en': 'Central Kitchen', 'inventory_store_id': 'store-42',
        })
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['inventory_store_id'], 'store-42')

    def test_admin_can_update_prep_kitchen(self):
        k = PrepKitchen.objects.create(name_en='Original Name')
        r = self.admin_client.patch(f'/api/cookbook/reference/prep-kitchens/{k.id}/', {
            'inventory_store_id': 'store-99',
        })
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['inventory_store_id'], 'store-99')
        self.assertEqual(r.data['name_en'], 'Original Name')

    def test_duplicate_name_is_rejected(self):
        PrepKitchen.objects.create(name_en='Existing')
        r = self.admin_client.post('/api/cookbook/reference/prep-kitchens/', {'name_en': 'Existing'})
        self.assertEqual(r.status_code, 400)
