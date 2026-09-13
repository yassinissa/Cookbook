"""
Branch (= brand) is the one reference-data model with an in-product
create/edit screen — every dish publish sends Branch.slug to
inventory-platform as its `brand` key, so getting a new brand set up
correctly matters more than the rest of reference data (which stays
Django-admin-only). Gated by `admin.branches`.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import Branch

User = get_user_model()


class BranchApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.admin_client = APIClient(HTTP_ACCEPT='application/json')
        self.admin_client.force_authenticate(self.admin)

        cook = User.objects.create_user('cook', password='x')
        p = cook.profile
        p.role = Role.objects.get(name='Restaurant Cook')
        p.scope_overridden = True
        p.save()
        p.extra_capabilities.set(Capability.objects.filter(code='dish.view'))
        self.cook_client = APIClient(HTTP_ACCEPT='application/json')
        self.cook_client.force_authenticate(cook)

    def test_any_authenticated_user_can_list_branches(self):
        Branch.objects.create(name_en='WnR')
        r = self.cook_client.get('/api/cookbook/reference/branches/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(any(b['name_en'] == 'WnR' for b in r.data))

    def test_user_without_capability_cannot_create_branch(self):
        r = self.cook_client.post('/api/cookbook/reference/branches/', {'name_en': 'New Spot'})
        self.assertEqual(r.status_code, 403)

    def test_admin_can_create_branch_and_slug_auto_generates(self):
        r = self.admin_client.post('/api/cookbook/reference/branches/', {'name_en': 'New Spot'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['slug'], 'new-spot')

    def test_slug_ignores_client_supplied_value(self):
        r = self.admin_client.post('/api/cookbook/reference/branches/', {
            'name_en': 'Another Spot', 'slug': 'hijacked-value',
        })
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['slug'], 'another-spot')

    def test_editing_name_does_not_change_an_existing_slug(self):
        b = Branch.objects.create(name_en='Original Name')
        original_slug = b.slug
        r = self.admin_client.patch(f'/api/cookbook/reference/branches/{b.id}/', {'name_en': 'Renamed'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['slug'], original_slug)   # unchanged — it's the published brand key
        self.assertEqual(r.data['name_en'], 'Renamed')

    def test_duplicate_name_is_rejected(self):
        Branch.objects.create(name_en='Existing')
        r = self.admin_client.post('/api/cookbook/reference/branches/', {'name_en': 'Existing'})
        self.assertEqual(r.status_code, 400)
