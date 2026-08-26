from decimal import Decimal

from django.test import SimpleTestCase

from apps.cookbook.units import convert, invert_bridge, ConversionError


class _U:
    """Stand-in for a UnitScale row."""
    def __init__(self, code, dimension, factor):
        self.code = code
        self.dimension = dimension
        self.factor_to_canonical = Decimal(str(factor))


G = _U('g', 'mass', 1)
KG = _U('Kg', 'mass', 1000)
ML = _U('ml', 'volume', 1)
TBS = _U('Tbs', 'volume', 15)
TS = _U('Ts', 'volume', 5)
CUP = _U('Cup', 'volume', 240)
EACH = _U('Pc', 'count', 1)


class SameDimensionTests(SimpleTestCase):
    def test_identity(self):
        self.assertEqual(convert(75, G, G), Decimal('75'))

    def test_g_to_kg(self):
        self.assertEqual(convert(1500, G, KG), Decimal('1.5'))

    def test_kg_to_g(self):
        self.assertEqual(convert(2, KG, G), Decimal('2000'))

    def test_tbs_to_ml(self):
        self.assertEqual(convert(2, TBS, ML), Decimal('30'))

    def test_cup_to_tbs(self):
        self.assertEqual(convert(1, CUP, TBS), Decimal('16'))

    def test_tbs_to_ts(self):
        self.assertEqual(convert(1, TBS, TS), Decimal('3'))


class CrossDimensionTests(SimpleTestCase):
    def test_needs_a_bridge(self):
        with self.assertRaises(ConversionError):
            convert(1, TBS, G)

    def test_tbs_to_g_via_density(self):
        # parsley: "1 Tbs = 3.0 g"  → 3.0 g / 15 ml = 0.2 g per ml
        bridges = {('volume', 'mass'): Decimal('0.2')}
        self.assertEqual(convert(1, TBS, G, bridges), Decimal('3.0'))
        # and 5 Tbs
        self.assertEqual(convert(5, TBS, G, bridges), Decimal('15.0'))

    def test_piece_to_g_via_weight(self):
        # lemon: "1 Piece = 117 g"
        bridges = {('count', 'mass'): Decimal('117')}
        self.assertEqual(convert(1, EACH, G, bridges), Decimal('117'))

    def test_g_to_tbs_via_inverted_density(self):
        dim, factor = invert_bridge('volume', 'mass', Decimal('0.2'))
        self.assertEqual(dim, ('mass', 'volume'))
        bridges = {dim: factor}
        # 3 g of parsley back to Tbs = 1
        self.assertEqual(convert(3, G, TBS, bridges), Decimal('1'))
