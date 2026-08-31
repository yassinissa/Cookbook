"""
Per-item measurement conversions, written from the app (Inventory screen).

The endpoint + serializer already existed; these tests pin the write shape the
new UI uses — nested `lines` (delete-and-recreate) plus the packaging scalars —
and prove that once a conversion is saved, a recipe line expressed in that
measure actually costs (rather than falling to `no_conversion`).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.cookbook.models import ItemConversion, ItemConversionLine
from apps.cookbook.services import cost_recipe
from .support import make_units

User = get_user_model()

URL = '/api/cookbook/item-conversions/'


class ItemConversionApiTests(APITestCase):
    def setUp(self):
        self.units = make_units()
        self.g = self.units['g']
        self.admin = User.objects.create_superuser('boss', password='x')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.admin)

    def test_create_with_lines_and_packaging(self):
        res = self.client.post(URL, {
            'item_sku': 'B900',
            'base_unit': str(self.g.id),
            'order_cost': '2.000',
            'pack_qty': '1000',
            'grams_per_piece': '50',
            'lines': [{'label': '1 Tbs', 'quantity': '15', 'unit': str(self.g.id)}],
        }, format='json')

        self.assertEqual(res.status_code, 201, res.content)
        ic = ItemConversion.objects.get(item_sku='B900')
        self.assertEqual(ic.grams_per_piece, Decimal('50'))
        self.assertEqual([(l.label, l.quantity, l.unit.code) for l in ic.lines.all()],
                         [('1 Tbs', Decimal('15'), 'g')])

    def test_patch_replaces_lines(self):
        ic = ItemConversion.objects.create(item_sku='B901')
        ItemConversionLine.objects.create(
            item_conversion=ic, label='1 Tbs', quantity=Decimal('15'), unit=self.g)

        res = self.client.patch(f'{URL}B901/', {
            'lines': [
                {'label': '1 Tbs', 'quantity': '18', 'unit': str(self.g.id)},
                {'label': '1 Cup', 'quantity': '288', 'unit': str(self.g.id)},
            ],
        }, format='json')

        self.assertEqual(res.status_code, 200, res.content)
        rows = sorted((l.label, l.quantity) for l in
                      ItemConversionLine.objects.filter(item_conversion__item_sku='B901'))
        self.assertEqual(rows, [('1 Cup', Decimal('288')), ('1 Tbs', Decimal('18'))])

    def test_saved_conversion_makes_a_tablespoon_line_cost(self):
        # before: a Tbs line on a priced item with no conversion is uncosted
        line = [{'item_sku': 'B902', 'quantity': '2', 'unit': 'Tbs'}]
        inv = {'B902': {'sku': 'B902', 'unit_cost': '0.002', 'unit_code': 'g'}}
        before = cost_recipe(lines=line, items_by_sku=inv)['lines'][0]
        self.assertEqual(before.status, 'no_conversion')

        # define it through the API: priced 0.002 KD/g, 1 Tbs = 15 g
        self.client.post(URL, {
            'item_sku': 'B902',
            'base_unit': str(self.g.id),
            'order_cost': '2.000',
            'pack_qty': '1000',
            'lines': [{'label': '1 Tbs', 'quantity': '15', 'unit': str(self.g.id)}],
        }, format='json')

        after = cost_recipe(lines=line, items_by_sku={})['lines'][0]
        self.assertEqual(after.status, 'ok')
        # 2 Tbs = 30 ml -> 30 g (density 1) -> 30 * 0.002
        self.assertAlmostEqual(float(after.amount), 0.06, places=6)

    def test_requires_auth(self):
        anon = APIClient(HTTP_ACCEPT='application/json')
        self.assertEqual(anon.get(f'{URL}B900/').status_code, 401)
