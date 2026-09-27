"""
Per-item conversion of any recipe unit into the item's inventory STOCK unit.

inventory-platform deducts stock (POS sales, voids, production batches) in
each item's stock unit — KG, LTR, PCS, PKT, BOX... A recipe may use any unit
(Tbs, Cup, g, Pc...), and how many of those make one stock unit depends on
the item: 1 Tbs of one sauce is 50 g, of another 15 g; a PKT of one item is
500 g, of another 12 pieces. All of that lives here in Cookbook, per SKU
(ItemConversion + its lines). This module turns it into one number per
(item, unit) — "1 <unit> = x stock units" — which is what gets synced to
inventory-platform (ItemUnitConversion there) and checked before a recipe
is published, so a POS upload never meets a unit it can't deduct.

How one stock unit is anchored:
  - a measure (kg, g, l, ml, ...): its fixed size, e.g. 1 KG = 1000 g;
  - anything else (PCS, PKT, BOX, ...): the SKU's "1 <order unit> =
    <pack_qty> <base unit>" from ItemConversion, when that order unit IS
    the stock unit (e.g. 1 PKT = 500 g). A piece-type stock unit with no
    pack data counts as one piece.
Cross-dimension steps (volume <-> mass, piece <-> mass) use the SKU's own
bridges from CostContext.bridges_for (its "1 Tbs = 25 g" lines, grams per
piece) — never a global density.
"""
from decimal import Decimal

from .costing import _fmt_qty

# inventory measure units: code -> (dimension, size in the dimension's
# canonical unit: g / ml). Codes are compared case-insensitively.
MEASURES = {
    'g': ('mass', Decimal('1')), 'gm': ('mass', Decimal('1')), 'gram': ('mass', Decimal('1')),
    'kg': ('mass', Decimal('1000')), 'kgs': ('mass', Decimal('1000')), 'kilo': ('mass', Decimal('1000')),
    'ton': ('mass', Decimal('1000000')),
    'oz': ('mass', Decimal('28.349523125')), 'lb': ('mass', Decimal('453.59237')),
    'ml': ('volume', Decimal('1')), 'cl': ('volume', Decimal('10')),
    'l': ('volume', Decimal('1000')), 'ltr': ('volume', Decimal('1000')),
    'liter': ('volume', Decimal('1000')), 'litre': ('volume', Decimal('1000')),
    'gal': ('volume', Decimal('3785.411784')),
}

# spellings of the same unit, for matching Cookbook's free-text order unit
# against inventory's stock unit code
_SAME = {
    'pc': 'pcs', 'pcs': 'pcs', 'ea': 'pcs', 'each': 'pcs', 'piece': 'pcs', 'pieces': 'pcs',
    'pkt': 'pack', 'pack': 'pack', 'packet': 'pack', 'pkts': 'pack',
    'ltr': 'l', 'l': 'l', 'liter': 'l', 'litre': 'l',
    'kg': 'kg', 'kgs': 'kg', 'kilo': 'kg',
    'btl': 'bottle', 'bottle': 'bottle', 'ctn': 'carton', 'carton': 'carton',
}

# Cookbook units that are not an amount of an ingredient
NOT_AN_AMOUNT = {'Portion'}


def same_unit(a, b):
    a, b = (a or '').strip().lower(), (b or '').strip().lower()
    return bool(a) and _SAME.get(a, a) == _SAME.get(b, b)


class ItemUnits:
    """Conversions for one SKU into its inventory stock unit."""

    def __init__(self, sku, stock_code, ctx):
        self.sku = sku
        self.stock_code = (stock_code or '').strip()
        self.ctx = ctx                      # costing.CostContext holding this SKU
        self.bridges = ctx.bridges_for(sku)
        self.anchor, self.problem = self._anchor()

    def _anchor(self):
        """(size of one stock unit in canonical units, dimension, description)."""
        code = self.stock_code.lower()
        if code in MEASURES:
            dim, size = MEASURES[code]
            return (size, dim, ''), None
        supp = self.ctx.supplements.get(self.sku)
        if supp and supp.pack_qty and supp.base_unit_id and same_unit(supp.order_unit, self.stock_code):
            base = supp.base_unit
            size = Decimal(supp.pack_qty) * Decimal(base.factor_to_canonical)
            return (size, base.dimension, f'1 {self.stock_code} = {_fmt_qty(supp.pack_qty)} {base.code}'), None
        if _SAME.get(code) == 'pcs':
            return (Decimal('1'), 'count', ''), None
        if supp and supp.pack_qty and supp.order_unit:
            why = (f'its conversion says 1 {supp.order_unit} = {_fmt_qty(supp.pack_qty)} '
                   f'{supp.base_unit.code if supp.base_unit_id else "?"}, but inventory stocks it in '
                   f'{self.stock_code}')
        else:
            why = 'it has no pack size'
        return None, (f'set how much one {self.stock_code} holds (e.g. "1 {self.stock_code} = 500 g") '
                      f'in this item\'s conversions — {why}')

    def _resolve(self, unit):
        """(stock units in one `unit`, how it was worked out) or (None, '')."""
        if self.anchor is None or unit is None or unit.code in NOT_AN_AMOUNT:
            return None, ''
        size, dim, desc = self.anchor
        if size <= 0:
            return None, ''
        generic = Decimal(unit.factor_to_canonical or 0)
        candidates = self.ctx.own_amounts(self.sku, unit.code) + (
            [(generic, unit.dimension, '')] if generic > 0 else [])
        canon = {'mass': 'g', 'volume': 'ml', 'count': 'pc'}
        for amount, cand_dim, text in candidates:
            steps = [text] if text else []
            if cand_dim != dim:
                bridge = self.bridges.get((cand_dim, dim))
                if bridge is None:
                    continue
                amount = amount * Decimal(bridge)
                steps.append(f'1 {unit.code} = {_fmt_qty(amount)} {canon.get(dim, dim)}')
            if desc:
                steps.append(desc)
            return amount / size, '; '.join(dict.fromkeys(steps))[:120]
        return None, ''

    def factor(self, unit):
        """Stock units in one `unit` (a UnitScale) of this item, or None."""
        return self._resolve(unit)[0]

    def label(self, unit):
        """Where a factor came from, for people reading it in inventory."""
        return self._resolve(unit)[1]

    def sync_rows(self, units, inventory_code_for):
        """[{unit, factor, label}] for every Cookbook unit that converts and
        exists on inventory-platform, except the stock unit itself."""
        rows, seen = [], set()
        for unit in units:
            code = inventory_code_for(unit.code)
            if not code or same_unit(code, self.stock_code) or code.lower() in seen:
                continue
            f = self.factor(unit)
            if f is None:
                continue
            seen.add(code.lower())
            rows.append({'unit': code, 'factor': f'{f:.12f}', 'label': self.label(unit)})
        return rows
