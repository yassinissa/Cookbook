"""
Find recipe lines where inventory's "PCS" is probably a pack, not a piece.

    python manage.py audit_piece_prices
    python manage.py audit_piece_prices --threshold 0.150

inventory-platform stocks many items in PCS where one PCS is really a pack or
a bottle (a pack of bay leaves, a 1.5 L bottle of oil). Two things go wrong:

  1. LOOKS WRONG — the recipe counts pieces too ("3 Pcs" = three leaves), so
     the line costs "fine" at the pack price: 3 x 1.250 KWD instead of a few
     fils. Nothing flags it. Listed when one inventory PCS costs more than
     --threshold (default 0.200 KWD).
  2. NOT COSTED — the recipe uses a weight or volume (2 Tbs of oil), and
     nothing says what one PCS holds, so the line costs 0 ("no conversion").

The fix is the same for both, once per item: in Inventory -> the item ->
Measurement conversions, say what one PCS holds ("1 Pcs = 1500 ml" or
grams per piece); for case 1 also write the recipe line in g / ml.

A recipe that is just one bought item sold as is (one ingredient, at most
1 piece — a bottle of Perrier) is skipped: there one PCS really is the
portion. The summary says how many were skipped.

Read-only: grouped by item, each with the recipes that use it.
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import CommandError

from apps.cookbook.audit import AuditedCommand
from apps.cookbook.costing import NO_CONVERSION, OK, CostContext, explain_line
from apps.cookbook.models import DishRecipe, ProductionRecipe
from apps.cookbook.stock_units import same_unit
from apps.integrations.inventory_client import InventoryAPIError, InventoryClient

LOOKS_WRONG = 'LOOKS WRONG'
NOT_COSTED = 'NOT COSTED'


def find_piece_price_problems(items_by_sku, threshold):
    """({sku: {'name', 'stock_unit', 'price', 'kind', 'uses': [(recipe, qty, unit, amount)]}},
    number of sold-as-is recipes skipped)."""
    found, skipped = {}, 0
    for model, kind_label in ((DishRecipe, 'dish'), (ProductionRecipe, 'production')):
        for r in (model.objects.filter(is_current=True)
                  .prefetch_related('ingredients__unit').order_by('name_en')):
            lines = list(r.ingredients.all())
            if len(lines) == 1 and lines[0].unit is not None and \
                    lines[0].unit.dimension == 'count' and (lines[0].quantity or 0) <= 1:
                skipped += 1      # a bottle / can sold as is
                continue
            ctx = CostContext([l.item_sku for l in lines], items_by_sku)
            for l in lines:
                inv = items_by_sku.get(l.item_sku)
                if not inv or not same_unit(inv.get('unit_code'), 'pcs'):
                    continue
                e = explain_line(l, ctx, inv.get('unit_code'))
                price = e['price']
                if price is None or price['source'] != 'inventory':
                    continue
                per_unit = Decimal(price['per_unit'])
                # priced per inventory piece AND counted in pieces by the recipe
                piece_priced = ctx.units_by_code.get(price['unit']) is not None and \
                    ctx.units_by_code[price['unit']].dimension == 'count'
                if (e['status'] == OK and piece_priced and l.unit is not None
                        and l.unit.dimension == 'count' and per_unit > threshold):
                    kind = LOOKS_WRONG
                elif e['status'] == NO_CONVERSION and piece_priced:
                    kind = NOT_COSTED
                else:
                    continue
                row = found.setdefault(l.item_sku, {
                    'name': inv.get('name_en') or l.item_name_snapshot,
                    'stock_unit': inv.get('unit_code'), 'price': per_unit,
                    'kind': kind, 'uses': [],
                })
                if kind == LOOKS_WRONG:      # the stronger finding wins for the item
                    row['kind'] = LOOKS_WRONG
                row['uses'].append((f'{r.name_en} ({kind_label})', e['quantity'], e['unit'],
                                    Decimal(e['amount'])))
    return found, skipped


class Command(AuditedCommand):
    help = 'List recipe lines where inventory prices the item per PCS that is likely a pack.'

    def add_arguments(self, parser):
        parser.add_argument('--threshold', type=Decimal, default=Decimal('0.200'),
                            help='KWD per inventory PCS above which a piece-counted line is suspicious.')

    def handle(self, *args, **opts):
        try:
            items = InventoryClient().get_items()
        except InventoryAPIError as e:
            raise CommandError(f'inventory-platform unreachable — nothing checked ({e})')
        found, skipped = find_piece_price_problems({i['sku']: i for i in items}, opts['threshold'])
        note = f' ({skipped} single-item recipes sold as is, e.g. a bottled drink, were skipped.)'
        if not found:
            self.stdout.write('No piece/pack price problems found.' + note)
            return

        order = sorted(found.items(), key=lambda kv: (
            kv[1]['kind'] != LOOKS_WRONG, -sum(u[3] for u in kv[1]['uses'])))
        for sku, row in order:
            self.stdout.write(f"\n[{row['kind']}] {row['name']} ({sku}) — inventory: "
                              f"{row['price']:.3f} KWD per {row['stock_unit']}")
            for recipe, qty, unit, amount in row['uses']:
                cost = f'= {amount:.3f} KWD' if row['kind'] == LOOKS_WRONG else 'costs 0 (no conversion)'
                self.stdout.write(f'    {recipe[:45]:45} {qty} {unit:5} {cost}')

        wrong = [r for r in found.values() if r['kind'] == LOOKS_WRONG]
        self.stdout.write(
            f'\n{len(found)} items: {len(wrong)} LOOKS WRONG '
            f'(adds {sum(u[3] for r in wrong for u in r["uses"]):.3f} KWD across their recipes), '
            f'{len(found) - len(wrong)} NOT COSTED.{note}\n'
            'Fix once per item: Inventory -> item -> Measurement conversions -> say what one PCS '
            'holds (e.g. "1 Pcs = 1500 ml", or grams per piece). For LOOKS WRONG also write the '
            'recipe line in g / ml.')
