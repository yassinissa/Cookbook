"""
Per-SKU storage / shelf-life supplement, written from the Inventory screen.
SKU-addressed like item-nutrition / item-conversions: GET 404 when absent,
POST creates, PATCH updates, empty strings on the hour fields become NULL.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import ItemStorage

User = get_user_model()

URL = '/api/cookbook/item-storage/'


class ItemStorageApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_absent_is_404(self):
        self.assertEqual(self.client.get(f'{URL}B900/').status_code, 404)

    def test_create_then_update_by_sku(self):
        create = self.client.post(URL, {
            'item_sku': 'B900',
            'storage_band': 'chilled',
            'shelf_life_hours': '72',
            'opened_shelf_life_hours': '',
            'storage_instructions_en': 'Keep below 4 °C, covered.',
            'label_notes_en': 'Decant into 2 kg tubs',
        }, format='json')
        self.assertEqual(create.status_code, 201, create.content)
        s = ItemStorage.objects.get(item_sku='B900')
        self.assertEqual(s.shelf_life_hours, 72)
        self.assertIsNone(s.opened_shelf_life_hours)          # '' -> NULL

        got = self.client.get(f'{URL}B900/')
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.data['storage_band_display'], 'Chilled')

        upd = self.client.patch(f'{URL}B900/', {'shelf_life_hours': '48'}, format='json')
        self.assertEqual(upd.status_code, 200)
        s.refresh_from_db()
        self.assertEqual(s.shelf_life_hours, 48)
        self.assertEqual(s.storage_instructions_en, 'Keep below 4 °C, covered.')  # kept

    def test_any_authenticated_user_can_read_and_write(self):
        u = User.objects.create_user('cook', password='x')
        u.profile.role = Role.objects.get(name='Prep Cook')
        u.profile.save()
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(u)
        self.assertEqual(
            c.post(URL, {'item_sku': 'X1', 'shelf_life_hours': '24'}, format='json').status_code, 201)

    def test_anonymous_is_401(self):
        self.assertEqual(APIClient().get(f'{URL}B900/').status_code, 401)
