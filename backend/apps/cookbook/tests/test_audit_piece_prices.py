"""
`manage.py audit_piece_prices` — inventory "PCS" that is really a pack.

Pins the cases found on production 2026-10-18: bay leaves counted as 3 Pcs
at a per-pack price (LOOKS WRONG), oil priced per PCS used in Tbs (NOT
COSTED); and what must stay quiet: a cheap per-piece item, a bottled drink
sold as is, a per-kg item.
"""
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.cookbook.models import DishRecipe, DishRecipeIngredient, ItemConversion, UnitScale
from .support import fake_inventory_items, item, make_units


class AuditPiecePricesTests(TestCase):
    def setUp(self):
        self.units = make_units()
        self.units['Portion'], _ = UnitScale.objects.get_or_create(code='Portion', defaults={
            'description': 'Portion', 'dimension': 'count', 'factor_to_canonical': Decimal('1')})
        self.inventory = [
            item('BAY', unit_cost='1.250', unit_code='pcs', name='Bay Leaves'),
            item('OIL', unit_cost='1.296', unit_code='pcs', name='Oil Sun Flower'),
            item('TORT', unit_cost='0.148', unit_code='pcs', name='Tortillas'),
            item('PERRIER', unit_cost='0.900', unit_code='pcs', name='Perrier Bottle'),
            item('ONION', unit_cost='0.450', unit_code='kg', name='Onion Red'),
            item('AGAR', unit_cost='22.500', unit_code='pcs', name='Agar Agar'),
            item('CORN', unit_cost='1.400', unit_code='pcs', name='Oil Corn'),
        ]
        # Oil Corn has its pack size in Cookbook ("1 PCS = 2000 ml"): costed, not listed
        ItemConversion.objects.create(item_sku='CORN', base_unit=self.units['ml'],
                                      order_unit='PCS', pack_qty=Decimal('2000'))
        self.dish('Chicken Liver', [('BAY', '3', 'Pcs'), ('OIL', '100', 'ml'),
                                    ('TORT', '2', 'EA'), ('ONION', '50', 'g'),
                                    ('BAY', '5', 'ml'), ('CORN', '2', 'Tbs')])
        self.dish('Mahalabia', [('AGAR', '1', 'Portion'), ('ONION', '1', 'g')])
        self.dish('Perrier', [('PERRIER', '1', 'Pcs')])

    def dish(self, name, lines):
        d = DishRecipe.objects.create(name_en=name, recipe_code=name, is_current=True)
        for sku, qty, unit in lines:
            DishRecipeIngredient.objects.create(recipe=d, item_sku=sku, item_name_snapshot=sku,
                                                quantity=Decimal(qty), unit=self.units[unit])
        return d

    def run_cmd(self, *args):
        out = StringIO()
        with fake_inventory_items(self.inventory):
            call_command('audit_piece_prices', *args, stdout=out)
        return out.getvalue()

    def test_flags_pack_priced_pieces_and_uncosted_pack_lines(self):
        out = self.run_cmd()
        self.assertIn('[LOOKS WRONG] Bay Leaves (BAY)', out)
        self.assertIn('3 Pcs     = 3.750 KWD', out)
        # the same item's not-costed use is labelled as such, not "= 0.000"
        self.assertIn('5 ml      costs 0 (no conversion)', out)
        self.assertIn('[NOT COSTED] Oil Sun Flower (OIL)', out)
        self.assertIn('[NOT AN AMOUNT] Agar Agar (AGAR)', out)
        self.assertIn('1 Portion costs 0 (not an amount', out)
        self.assertIn('3 items: 1 LOOKS WRONG (adds 3.750 KWD across their recipes), '
                      '1 NOT AN AMOUNT, 1 NOT COSTED', out)
        self.assertIn('1 single-item recipes sold as is', out)
        for quiet in ('Tortillas', 'Perrier Bottle', 'Onion', 'Oil Corn'):
            self.assertNotIn(quiet, out)

    def test_threshold_and_read_only(self):
        out = self.run_cmd('--threshold', '0.100')
        self.assertIn('Tortillas (TORT)', out)                  # 0.148 now counts
        self.assertFalse(DishRecipe.objects.exclude(cost=0).exists())
