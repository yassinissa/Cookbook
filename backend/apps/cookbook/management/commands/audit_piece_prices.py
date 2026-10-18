"""
Find recipe lines where inventory's "PCS" is probably a pack, not a piece,
and lines that measure an ingredient in Portion.

    python manage.py audit_piece_prices
    python manage.py audit_piece_prices --threshold 0.150

inventory-platform stocks many items in PCS where one PCS is really a pack or
a bottle. Costing uses the item's own pack size ("1 PCS = 1500 ml") when it
has one; without it, things go wrong:

  1. LOOKS WRONG — the recipe counts pieces too ("3 Pcs" = three leaves), so
     the line costs "fine" at the pack price. Listed when one inventory PCS
     costs more than --threshold (default 0.200 KWD).
  2. NOT COSTED — the recipe uses a weight or volume (2 Tbs of oil), and
     nothing says what one PCS holds, so the line costs 0.
  3. NOT AN AMOUNT — the recipe measures an ingredient in Portion ("1 Portion"
     of agar agar), which says nothing about how much; costed 0.

Fix for 1 and 2, once per item: Inventory -> the item -> Measurement
conversions, say what one PCS holds; for 1 also write the recipe line in
g / ml. Fix for 3: change the recipe line to g / ml / pieces.

A recipe that is just one bought item sold as is (one ingredient, at most
1 piece — a bottle of Perrier) is skipped for 1: there one PCS really is the
portion. The summary says how many were skipped.

Read-only: grouped by item, each with the recipes that use it.
"""
from decimal import Decimal

from django.core.management.base import CommandError

from apps.cookbook.audit import AuditedCommand
from apps.cookbook.costing import NO_CONVERSION, OK, CostContext, explain_line
from apps.cookbook.models import DishRecipe, ProductionRecipe
from apps.cookbook.stock_units import same_unit
from apps.cookbook.units import NOT_AN_AMOUNT
from apps.integrations.inventory_client import InventoryAPIError, InventoryClient

LOOKS_WRONG = 'LOOKS WRONG'
NOT_AN_AMOUNT_KIND = 'NOT AN AMOUNT'
NOT_COSTED = 'NOT COSTED'
_RANK = {LOOKS_WRONG: 0, NOT_AN_AMOUNT_KIND: 1, NOT_COSTED: 2}


def _sold_as_is(lines):
    return (len(lines) == 1 and lines[0].unit is not None
            and lines[0].unit.dimension == 'count' and lines[0].unit.code not in NOT_AN_AMOUNT
            and (lines[0].quantity or 0) <= 1)


def _classify(line, e, ctx, inv, threshold):
    """The problem kind for one line, or None."""
    if line.unit is not None and line.unit.code in NOT_AN_AMOUNT:
        return NOT_AN_AMOUNT_KIND
    price = e['price']
    if not same_unit(inv.get('unit_code'), 'pcs') or price is None or price['source'] != 'inventory':
        return None
    price_unit = ctx.units_by_code.get(price['unit'])
    piece_priced = price_unit is not None and price_unit.dimension == 'count'
    if not piece_priced:
        return None          # the item's pack size turned PCS into g / ml: fine
    if (e['status'] == OK and line.unit is not None and line.unit.dimension == 'count'
            and Decimal(price['per_unit']) > threshold):
        return LOOKS_WRONG
    if e['status'] == NO_CONVERSION:
        return NOT_COSTED
    return None


def find_piece_price_problems(items_by_sku, threshold):
    """({sku: {'name', 'stock_unit', 'price', 'kind',
               'uses': [(recipe, qty, unit, amount, kind)]}}, sold-as-is recipes skipped).
    An item's `kind` is its worst use's; each use keeps its own."""
    found, skipped = {}, 0
    for model, kind_label in ((DishRecipe, 'dish'), (ProductionRecipe, 'production')):
        for r in (model.objects.filter(is_current=True)
                  .prefetch_related('ingredients__unit').order_by('name_en')):
            lines = list(r.ingredients.all())
            if _sold_as_is(lines):
                skipped += 1      # a bottle / can sold as is
                continue
            ctx = CostContext([l.item_sku for l in lines], items_by_sku)
            for l in lines:
                inv = items_by_sku.get(l.item_sku) or {}
                e = explain_line(l, ctx, inv.get('unit_code'))
                kind = _classify(l, e, ctx, inv, threshold)
                if kind is None:
                    continue
                price = e['price']
                row = found.setdefault(l.item_sku, {
                    'name': inv.get('name_en') or l.item_name_snapshot or l.item_sku,
                    'stock_unit': inv.get('unit_code') or '?',
                    'price': Decimal(price['per_unit']) if price else None,
                    'price_unit': price['unit'] if price else None,
                    'kind': kind, 'uses': [],
                })
                if _RANK[kind] < _RANK[row['kind']]:
                    row['kind'] = kind
                row['uses'].append((f'{r.name_en} ({kind_label})', e['quantity'], e['unit'],
                                    Decimal(e['amount']), kind))
    return found, skipped


_USE_TEXT = {
    NOT_AN_AMOUNT_KIND: 'costs 0 (not an amount: use g / ml / pieces)',
    NOT_COSTED: 'costs 0 (no conversion)',
}


class Command(AuditedCommand):
    help = ('List recipe lines where inventory prices the item per PCS that is likely a pack, '
            'and lines measured in Portion.')

    def add_arguments(self, parser):
        parser.add_argument('--threshold', type=Decimal, default=Decimal('0.200'),
                            help='KWD per inventory PCS above which a piece-counted line is suspicious.')

    def handle(self, *args, **opts):
        try:
            items = InventoryClient().get_items()
        except InventoryAPIError as e:
            raise CommandError(f'inventory-platform unreachable, nothing checked ({e})')
        found, skipped = find_piece_price_problems({i['sku']: i for i in items}, opts['threshold'])
        note = f' ({skipped} single-item recipes sold as is, e.g. a bottled drink, were skipped.)'
        if not found:
            self.stdout.write('No piece/pack price problems found.' + note)
            return

        order = sorted(found.items(), key=lambda kv: (
            _RANK[kv[1]['kind']], -sum(u[3] for u in kv[1]['uses'])))
        for sku, row in order:
            price = (f"{row['price']:.3f} KWD per {row['price_unit']}" if row['price'] is not None
                     else 'no price')
            self.stdout.write(f"\n[{row['kind']}] {row['name']} ({sku}) - price: {price}")
            for recipe, qty, unit, amount, kind in row['uses']:
                cost = _USE_TEXT.get(kind) or f'= {amount:.3f} KWD'
                self.stdout.write(f'    {recipe[:45]:45} {qty} {unit:7} {cost}')

        count = {k: sum(1 for r in found.values() if r['kind'] == k) for k in _RANK}
        added = sum(u[3] for r in found.values() for u in r['uses'] if u[4] == LOOKS_WRONG)
        self.stdout.write(
            f'\n{len(found)} items: {count[LOOKS_WRONG]} LOOKS WRONG (adds {added:.3f} KWD across '
            f'their recipes), {count[NOT_AN_AMOUNT_KIND]} NOT AN AMOUNT, '
            f'{count[NOT_COSTED]} NOT COSTED.{note}\n'
            'LOOKS WRONG / NOT COSTED: Inventory -> item -> Measurement conversions -> say what '
            'one PCS holds (e.g. "1 Pcs = 1500 ml", or grams per piece); for LOOKS WRONG also '
            'write the recipe line in g / ml.\n'
            'NOT AN AMOUNT: the recipe measures an ingredient in Portion; change the line to '
            'g / ml / pieces.')
