"""
Live cost preview (`POST cookbook/cost-preview/`): unsaved ingredient rows
are costed with the same maths as a save, each line explains its price +
conversion + stock-unit deduction, nothing is written, and it's gated on
costing.view.
"""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import DishRecipe

from .support import fake_inventory_items, item, make_item_supplement, make_units

User = get_user_model()
URL = '/api/cookbook/cost-preview/'


class CostPreviewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.units = make_units()
        # oil priced per ml with its own "1 Tbs = 15 ml"; tomato per g, 182 g a piece
        make_item_supplement(self.units, 'B2050', 'ml', '3.250', '1000', None, [('1 Tbs', '15.0', 'ml')])
        make_item_supplement(self.units, 'B72', 'g', '0.450', '1000', '182', [])
        make_item_supplement(self.units, 'B470', 'g', '0.500', '1000', None, [])
        self.inventory = [item('B2050', unit_code='ltr'), item('B72', unit_code='kg'),
                          item('B470', unit_code='pkt')]
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(User.objects.create_superuser('boss', password='x'))

    def post(self, lines, **extra):
        with fake_inventory_items(self.inventory):
            return self.client.post(URL, {'lines': lines, **extra}, format='json')

    def test_each_line_explains_price_conversion_and_stock_deduction(self):
        resp = self.post([
            {'item_sku': 'B2050', 'quantity': '2', 'unit': 'Tbs'},
            {'item_sku': 'B72', 'quantity': '1', 'unit': str(self.units['Pc'].id)},
        ], expected_waste_pct='10')
        self.assertEqual(resp.status_code, 200, resp.data)
        oil, tomato = resp.data['lines']

        self.assertEqual(oil['status'], 'ok')
        self.assertEqual(oil['amount'], '0.0975')              # 30 ml x 0.00325
        self.assertEqual(oil['price'], {'per_unit': '0.003250', 'unit': 'ml', 'source': 'cookbook'})
        self.assertEqual(oil['base_qty'], '30')
        self.assertEqual(oil['conversion'], {'text': '1 Tbs = 15 ml', 'source': 'item'})
        self.assertEqual(oil['stock'], {'unit': 'ltr', 'qty': '0.03', 'problem': None})

        self.assertEqual(tomato['amount'], '0.0819')           # 182 g x 0.00045
        self.assertEqual(tomato['conversion']['text'], '1 Pc = 182 g')
        self.assertEqual(tomato['stock']['qty'], '0.182')

        self.assertEqual(resp.data['items'], '0.179')
        self.assertEqual(resp.data['waste'], '0.018')
        self.assertEqual(resp.data['per_serving'], '0.197')

    def test_problems_are_reported_per_line_not_guessed(self):
        resp = self.post([
            {'item_sku': 'NOPE', 'quantity': '5', 'unit': 'g'},
            {'item_sku': 'B72', 'quantity': '2', 'unit': 'Tbs'},    # no Tbs weight for tomato
            {'item_sku': 'B470', 'quantity': '10', 'unit': 'g'},    # stocked in PKT, no pack size
            {'item_sku': 'B470', 'quantity': '10', 'unit': ''},
        ])
        self.assertEqual(resp.status_code, 200, resp.data)
        unknown, no_conv, no_pack, no_unit = resp.data['lines']
        self.assertEqual(unknown['status'], 'unknown_sku')
        self.assertEqual(no_conv['status'], 'no_conversion')
        self.assertEqual(no_conv['amount'], '0.0000')
        self.assertIn('Tbs', no_conv['stock']['problem'])
        self.assertEqual(no_pack['status'], 'ok')               # costs fine...
        self.assertIsNone(no_pack['stock']['qty'])              # ...but can't be published
        self.assertIn('PKT'.lower(), no_pack['stock']['problem'].lower())
        self.assertEqual(no_unit['status'], 'no_conversion')

    def test_nothing_is_saved_and_input_is_validated(self):
        self.post([{'item_sku': 'B72', 'quantity': '100', 'unit': 'g'}])
        self.assertFalse(DishRecipe.objects.exists())
        resp = self.post([{'item_sku': 'B72', 'quantity': '-1', 'unit': 'g'}])
        self.assertEqual(resp.status_code, 400)
        self.assertIn('lines', resp.data)

    def test_needs_costing_view(self):
        u = User.objects.create_user('floor', password='x')
        u.profile.role = Role.objects.get(name='Branch Staff')
        u.profile.save()
        c = APIClient(HTTP_ACCEPT='application/json')
        c.force_authenticate(u)
        with fake_inventory_items(self.inventory):
            resp = c.post(URL, {'lines': []}, format='json')
        self.assertEqual(resp.status_code, 403)
