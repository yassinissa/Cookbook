"""
Recipe costing.

    line cost   = qty (converted to the item's base unit) x cost per base unit
    waste cost  = items cost x expected_waste_pct / 100
    labour cost = section salary x prep minutes / (208 h/month x 60)
    per serving = items + waste + (labour, if included)

Cost per base unit and the unit conversions come from Cookbook's own
ItemConversion data (imported from the store-items sheet). When a SKU has no
Cookbook cost, inventory-platform's unit_cost is the fallback. When a line
cannot be converted to the item's base unit it is reported
(status = 'no_conversion') and contributes 0 — never a silent wrong number.
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings

from .models import ItemConversion, ItemNutrition, UnitScale
from .parsing import label_parts, to_decimal
from .units import ConversionError, convert, invert_bridge

WORKING_MINUTES_PER_MONTH = Decimal(settings.COOKBOOK_WORKING_HOURS_PER_MONTH) * 60

# conversion-label unit word -> UnitScale code
LABEL_UNIT_CODE = {
    'tbs': 'Tbs', 'tbsp': 'Tbs', 'ts': 'Ts', 'tsp': 'Ts', 'cup': 'Cup',
    'piece': 'Pc', 'pc': 'Pc', 'pcs': 'Pcs', 'pinch': 'Pinch',
}
# inventory-platform unit_code -> Cookbook UnitScale code (for the fallback price path)
INVENTORY_UNIT_CODE = {
    'kg': 'Kg', 'g': 'g', 'l': 'Ltr', 'ml': 'ml', 'pcs': 'Pcs', 'pc': 'Pc',
    'each': 'EA', 'ea': 'EA', 'tbsp': 'Tbs', 'tsp': 'Ts', 'cup': 'Cup',
}

OK = 'ok'
NO_PRICE = 'no_price'
NO_CONVERSION = 'no_conversion'
UNKNOWN_SKU = 'unknown_sku'


@dataclass
class LineCost:
    sku: str
    quantity: Decimal
    unit_code: str
    amount: Decimal           # KWD; 0 unless status == 'ok'
    status: str
    detail: str = ''


@dataclass
class RecipeCost:
    items_total: Decimal
    lines: list = field(default_factory=list)

    @property
    def issues(self):
        return [l for l in self.lines if l.status != OK]

    @property
    def unknown_skus(self):
        return [l.sku for l in self.lines if l.status == UNKNOWN_SKU]


# ── context ─────────────────────────────────────────────────────────────────

class CostContext:
    """Everything the per-line costing needs, fetched once per recipe."""

    def __init__(self, skus, inventory_items_by_sku=None):
        skus = {s for s in skus if s}
        self.supplements = {
            s.item_sku: s for s in
            ItemConversion.objects
            .filter(item_sku__in=skus)
            .select_related('base_unit')
            .prefetch_related('lines__unit')
        }
        self.inventory = inventory_items_by_sku or {}
        self.units_by_code = {u.code: u for u in UnitScale.objects.all()}
        self.units_by_id = {str(u.id): u for u in self.units_by_code.values()}
        self.nutrition = {
            n.item_sku: n for n in
            ItemNutrition.objects.filter(item_sku__in=skus).select_related('unit_scale')
        }
        self._bridge_cache = {}

    # -- price + base unit -------------------------------------------------
    def price_for(self, sku):
        """(cost_per_base_unit: Decimal, base_unit: UnitScale, source: str) or None."""
        supp = self.supplements.get(sku)
        if supp and supp.base_unit_id:
            # order_cost / pack_qty is exact; the stored field can be a
            # rounded repeating decimal.
            if supp.order_cost and supp.pack_qty:
                return Decimal(supp.order_cost) / Decimal(supp.pack_qty), supp.base_unit, 'cookbook'
            if supp.cost_per_base_unit is not None:
                return Decimal(supp.cost_per_base_unit), supp.base_unit, 'cookbook'
        inv = self.inventory.get(sku)
        if inv:
            unit_cost = to_decimal(inv.get('unit_cost'))
            base = self.units_by_code.get(INVENTORY_UNIT_CODE.get((inv.get('unit_code') or '').lower()))
            if unit_cost and unit_cost > 0 and base is not None:
                return unit_cost, base, 'inventory'
        return None

    # -- cross-dimension bridges for one SKU -----------------------------
    def bridges_for(self, sku):
        if sku in self._bridge_cache:
            return self._bridge_cache[sku]
        bridges = {}
        supp = self.supplements.get(sku)
        if not supp:
            self._bridge_cache[sku] = bridges
            return bridges
        for line in supp.lines.all():
            mult, word = label_parts(line.label)
            label_unit = self.units_by_code.get(LABEL_UNIT_CODE.get((word or '').lower()))
            if mult is None or label_unit is None or line.unit is None or mult == 0:
                continue
            src_canon = mult * Decimal(label_unit.factor_to_canonical)          # e.g. ml
            dst_canon = Decimal(line.quantity) * Decimal(line.unit.factor_to_canonical)  # e.g. g
            if src_canon == 0:
                continue
            factor = dst_canon / src_canon
            key = (label_unit.dimension, line.unit.dimension)
            bridges.setdefault(key, factor)
            inv = invert_bridge(*key, factor)
            if inv:
                bridges.setdefault(inv[0], inv[1])
        gpp = supp.grams_per_piece or (
            Decimal(1000) / supp.pieces_per_kg if supp.pieces_per_kg else None
        )
        if gpp:
            bridges.setdefault(('count', 'mass'), Decimal(gpp))
            bridges.setdefault(('mass', 'count'), Decimal(1) / Decimal(gpp))
        self._bridge_cache[sku] = bridges
        return bridges

    def resolve_unit(self, raw):
        """A recipe line's `unit` can be a UnitScale, an id, a code, or blank."""
        if raw is None or raw == '':
            return None
        if isinstance(raw, UnitScale):
            return raw
        raw = str(raw)
        return self.units_by_id.get(raw) or self.units_by_code.get(raw)


# ── the maths ───────────────────────────────────────────────────────────────

def _norm_line(line):
    """(sku, quantity, unit_raw) from a dict or a model instance."""
    if isinstance(line, dict):
        return line.get('item_sku'), to_decimal(line.get('quantity')), line.get('unit')
    return line.item_sku, to_decimal(line.quantity), getattr(line, 'unit', None)


def cost_line(line, ctx):
    sku, qty, unit_raw = _norm_line(line)
    unit = ctx.resolve_unit(unit_raw)
    qty = qty or Decimal(0)
    unit_code = unit.code if unit else ''

    if not sku:
        return LineCost(sku or '', qty, unit_code, Decimal(0), UNKNOWN_SKU, 'no SKU')

    price = ctx.price_for(sku)
    if price is None:
        known = sku in ctx.supplements or sku in ctx.inventory
        return LineCost(sku, qty, unit_code, Decimal(0),
                        NO_PRICE if known else UNKNOWN_SKU,
                        'no price' if known else 'SKU not found')

    cost_per_base, base_unit, _src = price
    if unit is None:
        return LineCost(sku, qty, unit_code, Decimal(0), NO_CONVERSION, 'line has no unit')

    try:
        base_qty = convert(qty, unit, base_unit, ctx.bridges_for(sku))
    except ConversionError as e:
        return LineCost(sku, qty, unit_code, Decimal(0), NO_CONVERSION, str(e))

    return LineCost(sku, qty, unit_code, base_qty * Decimal(cost_per_base), OK)


def calculate_items_cost(lines, ctx):
    """items_total is unrounded — round only for display/storage, and only once,
    so a recipe with many small lines does not drift (matches the source sheet)."""
    line_costs = [cost_line(l, ctx) for l in lines]
    total = sum((lc.amount for lc in line_costs), Decimal(0))
    return RecipeCost(items_total=total, lines=line_costs)


def labor_cost(section, prep_minutes):
    if not section or section.avg_monthly_salary is None or not prep_minutes:
        return Decimal(0)
    return Decimal(section.avg_monthly_salary) * Decimal(prep_minutes) / WORKING_MINUTES_PER_MONTH


def compose_serving_cost(items_total, expected_waste_pct, labor, include_labor=True):
    items_total = Decimal(items_total or 0)
    waste = items_total * Decimal(expected_waste_pct or 0) / Decimal(100)
    labor = Decimal(labor or 0) if include_labor else Decimal(0)
    per_serving_raw = items_total + waste + labor
    return {
        'items': _round(items_total, 3),
        'waste': _round(waste, 3),
        'labor': _round(labor, 3),
        'per_serving': _round(per_serving_raw, 3),
        'per_serving_raw': per_serving_raw,   # for %/per-unit maths — avoids rounding drift
    }


def pricing_scenarios(per_serving):
    per_serving = Decimal(per_serving or 0)
    return [
        {'markup': n,
         'price': _round(per_serving * n, 3),
         'cost_pct': _round(Decimal(100) / n, 2)}
        for n in (2, 3, 4, 5)
    ]


def _round(value, places):
    q = Decimal(10) ** -places
    return Decimal(value).quantize(q, rounding=ROUND_HALF_UP)


def serialize_cost_result(result):
    """cost_recipe() output -> a JSON-safe dict for RecipeCardFields.cost_breakdown."""
    def s(v):
        return None if v is None else str(v)
    return {
        'items': s(result['breakdown']['items']),
        'waste': s(result['breakdown']['waste']),
        'labor': s(result['breakdown']['labor']),
        'per_serving': s(result['breakdown']['per_serving']),
        'food_cost_pct': s(result['food_cost_pct']),
        'revenue_pct': s(result['revenue_pct']),
        'cost_per_unit': s(result['cost_per_unit']),
        'scenarios': [
            {'markup': sc['markup'], 'price': s(sc['price']), 'cost_pct': s(sc['cost_pct'])}
            for sc in result['scenarios']
        ],
        'lines': [
            {'sku': lc.sku, 'quantity': s(lc.quantity), 'unit': lc.unit_code,
             'amount': s(_round(lc.amount, 4)), 'status': lc.status, 'detail': lc.detail}
            for lc in result['lines']
        ],
        'issues': [
            {'sku': lc.sku, 'status': lc.status, 'detail': lc.detail} for lc in result['issues']
        ],
    }
