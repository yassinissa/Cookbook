from decimal import Decimal

from django.test import SimpleTestCase

from apps.cookbook.recipe_sheet import (
    clean_code, parse_qty_unit, parse_revision, parse_steps, split_bilingual,
)


class ParsingTests(SimpleTestCase):
    def test_qty_unit_plain(self):
        self.assertEqual(parse_qty_unit('75 g'), (Decimal('75'), 'g'))
        self.assertEqual(parse_qty_unit('100 ml'), (Decimal('100'), 'ml'))
        self.assertEqual(parse_qty_unit('6 Pcs'), (Decimal('6'), 'Pcs'))

    def test_qty_unit_fraction(self):
        self.assertEqual(parse_qty_unit('  1/2  Ts'), (Decimal('0.5'), 'Ts'))
        self.assertEqual(parse_qty_unit('  1/4  Cup'), (Decimal('0.25'), 'Cup'))
        self.assertEqual(parse_qty_unit('  3/8  Ts'), (Decimal('0.375'), 'Ts'))

    def test_qty_unit_unparseable(self):
        self.assertEqual(parse_qty_unit('To Taste'), (None, ''))
        self.assertEqual(parse_qty_unit(''), (None, ''))

    def test_bilingual(self):
        self.assertEqual(split_bilingual('Tabbouleh Salad/سلطة التبولة'),
                         ('Tabbouleh Salad', 'سلطة التبولة'))
        self.assertEqual(split_bilingual('Mahalabia '), ('Mahalabia', ''))

    def test_steps(self):
        self.assertEqual(
            parse_steps('1) In a bowl put parsley.\n2) Add onion.\n3) Serve.'),
            ['In a bowl put parsley.', 'Add onion.', 'Serve.'],
        )

    def test_revision(self):
        self.assertEqual(
            parse_revision('Rev.01  -  Date: 04/07/2026  -  Salad  -  Dine'),
            ('Rev.01', 'Dine'),
        )
        self.assertEqual(parse_revision('Fix'), ('Fix', ''))

    def test_clean_code(self):
        self.assertEqual(clean_code(255.64999999999998), '255.65')
        self.assertEqual(clean_code(1076.9), '1076.9')
        self.assertEqual(clean_code(1082.075), '1082.075')
