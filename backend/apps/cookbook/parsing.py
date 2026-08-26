"""
Parsers for the free-text cells in the source workbook.

The "Store Items" sheet stores conversions as strings like "1 Tbs = 25.00 g".
The Recipe sheet stores ingredient lines like "75 g  Parsley Chopped".
"""
import re
from decimal import Decimal, InvalidOperation

# leading quantity in a conversion-line label, e.g. "1 Tbs", "1/2 Ts", "3/4 Cup"
_LABEL_QTY = re.compile(r'^\s*(\d+(?:\.\d+)?|\d+/\d+|\d+-\d+/\d+)\s*(.+?)\s*$')

# "1 Tbs = 25.00 g"  /  "1/4 Cup = 12.00 g"  /  "1 Piece = 0.3 g"
_CONVERSION = re.compile(
    r'^\s*(.+?)\s*=\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*$'
)


def parse_fraction(text):
    """'1' -> 1, '1/2' -> 0.5, '1-1/2' -> 1.5. Returns Decimal or None."""
    text = text.strip()
    try:
        if '-' in text and '/' in text:
            whole, frac = text.split('-', 1)
            num, den = frac.split('/')
            return Decimal(whole) + Decimal(num) / Decimal(den)
        if '/' in text:
            num, den = text.split('/')
            return Decimal(num) / Decimal(den)
        return Decimal(text)
    except (InvalidOperation, ValueError, ZeroDivisionError):
        return None


def label_multiplier(label):
    """
    The leading quantity of a conversion label as a Decimal.
    "1 Tbs" -> 1,  "1/4 Cup" -> 0.25,  "3/4 Cup" -> 0.75.  None if unparseable.
    """
    m = _LABEL_QTY.match(label or '')
    if not m:
        return None
    return parse_fraction(m.group(1))


def parse_conversion_cell(text):
    """
    "1 Tbs = 25.00 g" -> {'label': '1 Tbs', 'quantity': Decimal('25.00'), 'unit': 'g'}
    Returns None for blanks, "0", and zero-valued conversions ("1 Tbs = 0.00 g").
    """
    if text is None:
        return None
    text = str(text).strip()
    if not text or text == '0':
        return None
    m = _CONVERSION.match(text)
    if not m:
        return None
    label, qty, unit = m.group(1).strip(), m.group(2), m.group(3).strip()
    try:
        quantity = Decimal(qty)
    except InvalidOperation:
        return None
    if quantity == 0:
        return None
    return {'label': label, 'quantity': quantity, 'unit': unit}


def to_decimal(value):
    """Excel cell -> Decimal or None. Tolerates strings, floats, blanks, '0'."""
    if value is None or value == '':
        return None
    try:
        d = Decimal(str(value))
    except InvalidOperation:
        return None
    return d
