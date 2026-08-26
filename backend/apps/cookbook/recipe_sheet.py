"""
Parsers for the "200 Lebanese Menu Cook Book.xlsm" recipe sheets.

  parse_menu_to_dor  — one clean row per dish: identity, price, section,
                       revision, approvers, rating, nutrition, steps text.
  parse_recipe_blocks — the "Recipe" sheet's 100-row cards, for the one thing
                        "Menu To DOR" lacks: ingredient SKUs. Keyed by name.
  parse_dish_standards — the (mostly empty) QA standards shell.
"""
import re
from decimal import Decimal

from .parsing import parse_fraction, to_decimal

BLOCK_SIZE = 100
FIRST_BLOCK_ROW = 101

# "75 g …", "1/2  Ts …", "1-1/2 Cup …"  ->  qty, unit
_QTY_UNIT = re.compile(r'^\s*(\d+(?:\.\d+)?|\d+/\d+|\d+-\d+/\d+)\s+([A-Za-z]+)\b')


def _col(row, idx):
    return row[idx] if idx < len(row) else None


def _s(v):
    return str(v).strip() if v is not None else ''


def _split_name_note(text):
    """'Cauliflower   Fried' -> ('Cauliflower', 'Fried');  'Parsley Chopped  ' -> ('Parsley Chopped', '')"""
    parts = re.split(r'\s{2,}', _s(text))
    parts = [p for p in parts if p]
    if not parts:
        return '', ''
    return parts[0], ' '.join(parts[1:])


def parse_qty_unit(text):
    m = _QTY_UNIT.match(_s(text))
    if not m:
        return None, ''
    return parse_fraction(m.group(1)), m.group(2)


def split_bilingual(text):
    """'Tabbouleh Salad/سلطة التبولة' -> ('Tabbouleh Salad', 'سلطة التبولة')"""
    text = _s(text)
    if '/' in text:
        en, ar = text.split('/', 1)
        return en.strip(), ar.strip()
    return text, ''


def parse_steps(text):
    out = []
    for line in _s(text).splitlines():
        line = re.sub(r'^\s*\d+[\).]\s*', '', line).strip()
        if line:
            out.append(line)
    return out


def clean_code(value):
    """Menu-To-DOR recipe codes come through as noisy floats
    (255.64999999999998). Round to 3 dp and drop trailing zeros."""
    d = to_decimal(value)
    if d is None:
        return _s(value)
    return f'{d:.3f}'.rstrip('0').rstrip('.')


def parse_revision(text):
    """'Rev.01  -  Date: 04/07/2026  -  Salad  -  Dine' -> ('Rev.01', 'Dine')"""
    text = _s(text)
    if not text:
        return '', ''
    parts = [p.strip() for p in text.split('-')]
    label = parts[0] if parts else ''
    branch = parts[-1] if len(parts) > 1 else ''
    return label, branch


NUTRIENT_COLS = {
    'calories': 24, 'fat_g': 25, 'protein_g': 26, 'saturated_fat_g': 27, 'trans_fat_g': 28,
    'cholesterol_mg': 29, 'sodium_mg': 30, 'carbs_g': 31, 'fibers_g': 32, 'sugars_g': 33,
    'added_sugars_g': 34,
}


def parse_menu_to_dor(ws):
    """-> list of dicts keyed for import. Skips the two header rows."""
    dishes = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        name_raw = _col(row, 1)
        if not name_raw or not _s(_col(row, 0)):     # need SR.NO + name
            continue
        name_en, name_ar = split_bilingual(name_raw)
        rev_label, branch = parse_revision(_col(row, 13))
        waste = to_decimal(_col(row, 9))
        dishes.append({
            'name_en': name_en,
            'name_ar': name_ar,
            'price': to_decimal(_col(row, 2)),
            'category': _s(_col(row, 3)),
            'items_manual_cost': to_decimal(_col(row, 8)),
            'expected_waste_pct': (waste * 100) if waste is not None else Decimal(0),
            'prep_time_minutes': to_decimal(_col(row, 11)),
            'section': _s(_col(row, 12)),
            'revision': rev_label,
            'branch': branch,
            'approvers': _s(_col(row, 14)),
            'recipe_code': clean_code(_col(row, 15)),
            'steps': parse_steps(_col(row, 20)),
            'rating': to_decimal(_col(row, 21)),
            'rating_raw': _s(_col(row, 21)),
            'rating_status': _s(_col(row, 22)).lower(),
            'rating_date': _col(row, 23),
            'nutrition': {k: (to_decimal(_col(row, i)) or Decimal(0)) for k, i in NUTRIENT_COLS.items()},
            'menu_to_dor_cost': to_decimal(_col(row, 4)),   # for the acceptance report
        })
    return dishes


def parse_recipe_blocks(ws):
    """-> {name_en: {'ingredients': [...], 'taste_profile': str, 'approvers': [...]}}"""
    rows = list(ws.iter_rows(min_row=1, values_only=True))

    def cell(r, c):
        return rows[r - 1][c] if 0 <= r - 1 < len(rows) and c < len(rows[r - 1]) else None

    out = {}
    n = 0
    while True:
        base = FIRST_BLOCK_ROW + n * BLOCK_SIZE
        n += 1
        if base - 1 >= len(rows):
            break
        name = _s(cell(base + 15, 1))
        if not name:
            if base > 3400:
                break
            continue

        # The ingredient table (cols I/L/M/N/O) sits in this window. It has
        # gap rows and sub-note rows with no SKU — scan the whole window and
        # keep every row that actually has a Bxxxx code; don't stop at a gap.
        ingredients = []
        for rr in range(base + 27, base + BLOCK_SIZE - 3):
            sku = _s(cell(rr, 11))
            if not sku.startswith('B'):
                continue
            qty, unit = parse_qty_unit(cell(rr, 12))
            iname, note = _split_name_note(cell(rr, 8))
            scaled = to_decimal(cell(rr, 13))
            base_unit = _s(cell(rr, 14))          # column O — the costing unit (g/ml/EA)
            if qty is None and scaled is not None and base_unit:
                # unparseable original qty (e.g. "To Taste") — fall back to the
                # scaled quantity in the item's base unit
                qty, unit = scaled, base_unit
            ingredients.append({
                'item_sku': sku, 'quantity': qty, 'unit': unit,
                'item_name_snapshot': iname, 'prep_note': note,
                'scaled_qty': scaled, 'base_unit': base_unit,
            })

        taste = _s(cell(base + 38, 3))
        if taste.lower().startswith('taste profile'):
            taste = ''

        out[name] = {
            'ingredients': ingredients,
            'taste_profile': taste,
            'exec_approver': _s(cell(base + 50, 28)),
            'qa_approver': _s(cell(base + 52, 28)),
        }
    return out


def parse_dish_standards(ws):
    """-> {name: {'revision': str, 'approval_date': date|None}} — the sheet is
    mostly zeros; we only keep what's real."""
    out = {}
    for row in ws.iter_rows(min_row=4, values_only=True):
        name = _s(_col(row, 2))
        if not name:
            continue
        rev = _s(_col(row, 3))
        approval = _col(row, 4)
        out[name] = {
            'revision': rev if rev and rev != '0' else '',
            'approval_date': approval if hasattr(approval, 'year') else None,
        }
    return out
