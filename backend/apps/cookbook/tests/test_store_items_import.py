"""
`manage.py import_store_items` + `import_item_nutrition` against the
"cookbook guide unit" workbook layout (one "Sheet1" carrying the conversion
columns, the Tbs/piece/pkt/kg/box columns, and nutrition — each block repeated
as an empty second copy, which the header lookup must skip).

Pins: the 1,000,000 placeholder reads as "not set", merge keeps hand-entered
values + lines, --replace overwrites, --skip-cost leaves cost alone, the
"Grams In 1 Tbs" density fallback on an ml Tbs line, and all-zero nutrition
rows being skipped.
"""
import tempfile
from decimal import Decimal
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from apps.cookbook.models import ItemConversion, ItemConversionLine, ItemNutrition
from apps.cookbook.tests.support import make_units

HEADER = [
    'Code', 'Store Items', 'Order \nUnit', 'Cost (KD)/\nOrder Unit', 'Unit\nScale',
    'Total \nUnit', 'Cost (KD)/\nUnit Scale',
    '1 Tbs Of ml Or Gram', '1 Ts Of ml Or Gram', 'Note To Add',
    '1 Tbs Of ml into Gram', '1 Ts Of ml into Gram',
    'Grams In\n1 Tbs', 'Grams In\n1 Piece', 'Pieces In\n1 Pkt', 'Pieces In\n1 Kg', 'Pieces or Pkt\nIn Box',
    'Grams In 1 Tbs', 'Grams In 1 Piece', 'Pieces In 1 Pkt', 'Pieces In 1 Kg', 'Pieces or Pkt In Box',
    'Calories/Unit\nالسعرات', 'Fat (g)/Unit', 'Protein (g)/Unit', 'Saturated Fat (g)/Unit',
    'Trans Fats (g)/Unit', 'Cholesterol (mg)/Unit', 'Sodium (mg)/Unit', 'Carbs (g)/Unit',
    'Fibers (g)/Unit', 'Sugars (g)/Unit', 'Added Sugars (g)/Unit',
    'Calories/Unit\nالسعرات', 'Fat (g)/Unit',          # empty duplicate block
]
NUTR0 = [0] * 11


def row(code, unit, order_unit, order_cost, total, tbs, ts, tbs_g, ts_g,
        g_tbs, g_pc, pc_pkt, pc_kg, box, nutr=NUTR0):
    return [code, f'{code} item', order_unit, order_cost, unit, total, None,
            tbs, ts, 0, tbs_g, ts_g,
            g_tbs, g_pc, pc_pkt, pc_kg, box, '', '', '', '', '',
            *nutr, '', '']


ROWS = [
    # dry good in g, the box column carries the 1M placeholder
    row('B1', 'g', 'PKT', 2.5, 500, '1 Tbs = 25.00 g', '1 Ts = 8.33 g', 0, 0,
        25, 0, 4, 0, 1000000,
        nutr=[3.9, 0.32, 0.25, 0.19, 0.01, 1, 7, 0.02, 0, 0.01, 0]),
    # liquid: ml lines, no "into gram" value, density only in "Grams In 1 Tbs"
    row('B2', 'ml', 'LTR', 1.2, 1000, '1 Tbs = 15.00 ml', '1 Ts = 5.00 ml', 0, 0,
        17, 0, 0, 0, 12, nutr=[0.5, 0, 0, 0, 0, 0, 0, 0.1, 0, 0.1, 0]),
    # piece item, zero-valued conversion cells, all-zero nutrition
    row('B3', 'EA', 'BOX', 6, 24, '1 Tbs = 0.00 g', '1 Ts = 0.00 g', 0, 0,
        0, 80, 6, 12, 1000000),
]


class StoreItemsImportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.units = make_units()

    def setUp(self):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Sheet1'
        ws.append(HEADER)
        for r in ROWS:
            ws.append(r)
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.tmp.name) / 'guide.xlsx')
        wb.save(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def conv(self, *extra):
        call_command('import_store_items', *extra, file=self.path, sheet='Sheet1', stdout=_Null())

    def lines(self, sku):
        return {(ln.label, ln.unit.code): ln for ln in ItemConversionLine.objects.filter(item_conversion__item_sku=sku)}

    def test_imports_packaging_and_ignores_million_placeholder(self):
        self.conv()
        b1 = ItemConversion.objects.get(item_sku='B1')
        self.assertIsNone(b1.pieces_or_pack_per_box)
        self.assertEqual(b1.pieces_per_pack, Decimal('4'))
        self.assertEqual((b1.order_unit, b1.pack_qty, b1.base_unit.code), ('PKT', Decimal('500'), 'g'))
        b3 = ItemConversion.objects.get(item_sku='B3')
        self.assertEqual((b3.grams_per_piece, b3.pieces_per_pack, b3.pieces_per_kg),
                         (Decimal('80'), Decimal('6'), Decimal('12')))
        self.assertIsNone(b3.pieces_or_pack_per_box)
        self.assertEqual(ItemConversion.objects.get(item_sku='B2').pieces_or_pack_per_box, Decimal('12'))
        self.assertEqual(b1.note_to_add, '')

    def test_lines_and_tbs_density_fallback(self):
        self.conv()
        self.assertEqual(set(self.lines('B1')), {('1 Tbs', 'g'), ('1 Ts', 'g')})
        b2 = self.lines('B2')
        self.assertEqual(b2[('1 Tbs', 'ml')].gram_equivalent, Decimal('17'))
        self.assertIsNone(b2[('1 Ts', 'ml')].gram_equivalent)
        self.assertEqual(self.lines('B3'), {})          # "= 0.00 g" cells are not conversions

    def test_cost_imported_unless_skipped(self):
        self.conv('--skip-cost')
        b1 = ItemConversion.objects.get(item_sku='B1')
        self.assertIsNone(b1.order_cost)
        self.assertIsNone(b1.cost_per_base_unit)
        self.conv('--replace')
        b1.refresh_from_db()
        self.assertEqual(b1.order_cost, Decimal('2.5'))
        self.assertEqual(b1.cost_per_base_unit, Decimal('0.005'))

    def test_merge_keeps_hand_entered_values_and_lines(self):
        g, ml = self.units['g'], self.units['ml']
        b1 = ItemConversion.objects.create(item_sku='B1', pieces_per_pack=Decimal('9'),
                                           pieces_or_pack_per_box=Decimal('1000000'))
        ItemConversionLine.objects.create(item_conversion=b1, label='1 Tbs', quantity=Decimal('30'), unit=g)
        ItemConversionLine.objects.create(item_conversion=b1, label='1 Tbs', quantity=Decimal('15'), unit=ml)

        self.conv('--skip-cost')
        self.conv('--skip-cost')                        # idempotent
        b1.refresh_from_db()
        self.assertEqual(b1.pieces_per_pack, Decimal('9'))      # kept
        self.assertEqual(b1.pack_qty, Decimal('500'))           # blank → filled
        self.assertIsNone(b1.pieces_or_pack_per_box)            # stored placeholder dropped
        lines = self.lines('B1')
        self.assertEqual(set(lines), {('1 Tbs', 'g'), ('1 Tbs', 'ml'), ('1 Ts', 'g')})
        self.assertEqual(lines[('1 Tbs', 'g')].quantity, Decimal('30'))   # not overwritten

        self.conv('--skip-cost', '--replace')
        b1.refresh_from_db()
        self.assertEqual(b1.pieces_per_pack, Decimal('4'))
        self.assertEqual(self.lines('B1')[('1 Tbs', 'g')].quantity, Decimal('25'))
        self.assertNotIn(('1 Tbs', 'ml'), self.lines('B1'))

    def test_dry_run_saves_nothing(self):
        self.conv('--dry-run')
        call_command('import_item_nutrition', file=self.path, sheet='Sheet1', dry_run=True, stdout=_Null())
        self.assertFalse(ItemConversion.objects.exists())
        self.assertFalse(ItemNutrition.objects.exists())

    def test_nutrition_import(self):
        ItemNutrition.objects.create(item_sku='B2', unit_scale=self.units['ml'], calories=Decimal('9'))
        call_command('import_item_nutrition', file=self.path, sheet='Sheet1', stdout=_Null())
        b1 = ItemNutrition.objects.get(item_sku='B1')
        self.assertEqual((b1.unit_scale.code, b1.calories, b1.sodium_mg, b1.fibers_g),
                         ('g', Decimal('3.9'), Decimal('7'), Decimal('0')))
        self.assertFalse(ItemNutrition.objects.filter(item_sku='B3').exists())   # all-zero row skipped
        self.assertEqual(ItemNutrition.objects.get(item_sku='B2').calories, Decimal('9'))  # kept


class _Null:
    def write(self, *a, **k):
        pass

    def flush(self):
        pass
