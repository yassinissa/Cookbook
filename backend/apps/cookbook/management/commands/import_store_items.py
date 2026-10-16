"""
Import per-SKU cost + conversion + packaging data from the source workbook's
"Store Items" sheet into Cookbook's ItemConversion / ItemConversionLine tables.

    python manage.py import_store_items --file "00 Store Items.xlsx"
    python manage.py import_store_items --file "cookbook guide unit .xlsx" --sheet Sheet1 --skip-cost
    python manage.py import_store_items --file "..." --dry-run

Why Cookbook owns this: the deployed inventory-platform has a price for only a
handful of items and computes cost from purchase orders, while this sheet has a
real cost for ~2,111 SKUs plus the density conversions recipe costing needs.

Merges by default: an existing ItemConversion keeps every value someone already
entered (only blank fields are filled) and keeps its lines (only lines missing
by label + unit are added). --replace restores the old overwrite behaviour —
sheet values win and each SKU's lines are rebuilt from the sheet.
Idempotent either way (matched on item_sku).

--skip-cost leaves cost_per_base_unit / order_cost alone, so importing the
conversions doesn't silently re-cost every dish off the sheet's prices.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.cookbook.models import ItemConversion, ItemConversionLine, UnitScale
from apps.cookbook.models.item_supplement import CostSource
from apps.cookbook.parsing import parse_conversion_cell, to_decimal
from apps.cookbook.audit import AuditedCommand

# "Unit Scale" cell text -> UnitScale.code
BASE_UNIT_MAP = {'g': 'g', 'ml': 'ml', 'ea': 'EA', 'each': 'EA', 'pc': 'Pc', 'pcs': 'Pcs', 'm': 'm'}

# The sheets fill "no value" cells with 1,000,000 (notably "Pieces or Pkt In
# Box"). It's a placeholder, never a real count — treat it as 0 / not set.
PLACEHOLDER_MIN = Decimal(1_000_000)

# The 12 cooking-measure columns, by header text (matched case-insensitively,
# substring). Order matters only for reporting.
CONVERSION_HEADERS = [
    '1 tbs of ml or gram', '1 ts of ml or gram', '1/2 ts of ml or gram',
    '1/4 ts of ml or gram', '1/8 ts of ml or gram',
    '1 cup of ml or gram', '3/4 cup of ml or gram', '2/3 cup of ml or gram',
    '1/2 cup of ml or gram', '1/3 cup of ml or gram', '1/4 cup of ml or gram',
    '1/8 cup of ml or gram',
]
GRAM_EQUIV_HEADERS = [
    '1 tbs of ml into gram', '1 ts of ml into gram', '1/2 ts of ml into gram',
    '1/4 ts of ml into gram', '1/8 ts of ml into gram',
    '1 cup of ml into gram', '3/4 cup of ml into gram', '2/3 cup of ml into gram',
    '1/2 cup of ml into gram', '1/3 cup of ml into gram', '1/4 cup of ml into gram',
    '1/8 cup of ml into gram',
]

PACK_FIELDS = ('grams_per_piece', 'pieces_per_pack', 'pieces_per_kg', 'pieces_or_pack_per_box')


def _norm(s):
    return ' '.join(str(s or '').lower().split())


def _nonzero(d):
    """A 0 (or the 1,000,000 placeholder) in these sheets means 'not filled in'."""
    if d is None or d == 0 or d >= PLACEHOLDER_MIN:
        return None
    return d


def _blank(v):
    return v is None or v == '' or (isinstance(v, Decimal) and v >= PLACEHOLDER_MIN)


class Command(AuditedCommand):
    help = 'Import item cost + conversions from the "Store Items" sheet.'

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True)
        parser.add_argument('--sheet', default='Store Items')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--replace', action='store_true',
                            help='Overwrite existing values and rebuild lines (default: merge).')
        parser.add_argument('--skip-cost', action='store_true',
                            help='Import conversions/packaging only; leave cost fields untouched.')

    def handle(self, *args, **opts):
        import openpyxl

        wb = openpyxl.load_workbook(opts['file'], read_only=True, data_only=True)
        ws = wb[opts['sheet']]
        rows = ws.iter_rows(values_only=True)

        # ── locate the header row (first row containing a "Code" cell) ─────────
        header = None
        for r in rows:
            if any(_norm(c) == 'code' for c in r):
                header = [_norm(c) for c in r]
                break
        if header is None:
            self.stderr.write('No header row with a "Code" column found.')
            return

        def col(*names):
            for name in names:
                for i, h in enumerate(header):
                    if h == _norm(name) or _norm(name) in h:
                        return i
            return None

        idx = {
            'code': col('code'),
            'base_unit': col('unit scale'),
            'cost_per_scale': col('cost (kd)/ unit scale', 'cost (kd)/unit scale'),
            'order_unit': col('order unit', 'order \nunit'),
            'order_cost': col('cost (kd)/ order unit', 'cost (kd)/order unit'),
            'pack_qty': col('total unit', 'total \nunit'),
            'note': col('note to add'),
            'g_per_tbs': col('grams in\n1 tbs', 'grams in 1 tbs'),
            'g_per_piece': col('grams in\n1 piece', 'grams in 1 piece'),
            'pcs_per_pkt': col('pieces in\n1 pkt', 'pieces in 1 pkt'),
            'pcs_per_kg': col('pieces in\n1 kg', 'pieces in 1 kg'),
            'pcs_per_box': col('pieces or pkt\nin box', 'pieces or pkt in box'),
        }
        conv_cols = [col(h) for h in CONVERSION_HEADERS]
        geq_cols = [col(h) for h in GRAM_EQUIV_HEADERS]

        if idx['code'] is None:
            self.stderr.write('Could not find the Code column.')
            return

        def cell(r, key):
            i = idx[key]
            return r[i] if i is not None and i < len(r) else None

        def num(r, key):
            return _nonzero(to_decimal(cell(r, key)))

        units = {u.code: u for u in UnitScale.objects.all()}
        unit_by_lower = {u.code.lower(): u for u in UnitScale.objects.all()}
        replace, skip_cost = opts['replace'], opts['skip_cost']

        stat = dict(rows=0, created=0, updated=0, priced=0, with_conv=0,
                    no_base_unit=0, lines=0, kept_lines=0, placeholders=0)
        now = timezone.now()

        # Everything is read up front and written in bulk at the end — this runs
        # against a remote Postgres too, where a query per row takes hours.
        by_sku = {o.item_sku: o for o in ItemConversion.objects.all()}
        line_keys = {}
        for conv_id, label, unit_id in ItemConversionLine.objects.values_list(
                'item_conversion_id', 'label', 'unit_id'):
            line_keys.setdefault(conv_id, set()).add((label.lower(), unit_id))
        new_ids, to_update, update_fields, replaced_ids, new_lines = set(), {}, set(), [], []

        for r in ws.iter_rows(min_row=1, values_only=True):
            code = cell(r, 'code')
            if not code or _norm(code) in ('code', ''):
                continue
            code = str(code).strip()
            if not code.startswith('B'):
                continue
            stat['rows'] += 1

            base_code = BASE_UNIT_MAP.get(_norm(cell(r, 'base_unit')))
            base_unit = units.get(base_code) if base_code else None
            if base_unit is None:
                stat['no_base_unit'] += 1

            box = to_decimal(cell(r, 'pcs_per_box'))
            if box is not None and box >= PLACEHOLDER_MIN:
                stat['placeholders'] += 1

            defaults = {
                'order_unit': str(cell(r, 'order_unit') or '')[:20],
                'pack_qty': num(r, 'pack_qty'),
                'note_to_add': '' if cell(r, 'note') in (None, 0, '0') else str(cell(r, 'note')),
                'grams_per_piece': num(r, 'g_per_piece'),
                'pieces_per_pack': num(r, 'pcs_per_pkt'),
                'pieces_per_kg': num(r, 'pcs_per_kg'),
                'pieces_or_pack_per_box': _nonzero(box),
            }
            if base_unit is not None:
                defaults['base_unit'] = base_unit
            if not skip_cost:
                cost = num(r, 'cost_per_scale')
                order_cost = num(r, 'order_cost')
                pack_qty = defaults['pack_qty']
                if cost is None and order_cost and pack_qty:
                    cost = (order_cost / pack_qty).quantize(Decimal('0.000001'))
                defaults['order_cost'] = order_cost
                if cost is not None and base_unit is not None:
                    defaults.update(cost_per_base_unit=cost,
                                    cost_source=CostSource.EXCEL_IMPORT, cost_updated_at=now)
                    stat['priced'] += 1

            # ── conversion lines ─────────────────────────────────────────
            g_per_tbs = num(r, 'g_per_tbs')
            parsed_lines = []
            for pos, ci in enumerate(conv_cols):
                if ci is None or ci >= len(r):
                    continue
                p = parse_conversion_cell(r[ci])
                if not p:
                    continue
                unit = unit_by_lower.get(p['unit'].lower())
                if unit is None:
                    continue
                geq = None
                gi = geq_cols[pos] if pos < len(geq_cols) else None
                if gi is not None and gi < len(r):
                    gp = parse_conversion_cell(r[gi])
                    geq = gp['quantity'] if gp else None
                # "Grams In 1 Tbs" is the density for a liquid's ml Tbs line
                # when the "... into Gram" column was left empty.
                if geq is None and p['label'] == '1 Tbs' and unit.dimension != 'mass':
                    geq = g_per_tbs
                parsed_lines.append(dict(label=p['label'], quantity=p['quantity'],
                                         unit=unit, gram_equivalent=geq))
            if g_per_tbs and not any(pl['label'] == '1 Tbs' for pl in parsed_lines) and 'g' in units:
                parsed_lines.insert(0, dict(label='1 Tbs', quantity=g_per_tbs,
                                            unit=units['g'], gram_equivalent=None))
            if parsed_lines:
                stat['with_conv'] += 1

            obj = by_sku.get(code)
            if obj is None:
                obj = by_sku[code] = ItemConversion(item_sku=code, **defaults)
                new_ids.add(obj.pk)
                stat['created'] += 1
                existing = line_keys.setdefault(obj.pk, set())
            else:
                changed = []
                for field, value in defaults.items():
                    cur = getattr(obj, field)
                    if replace:
                        new = value
                    elif value in (None, ''):
                        # nothing in the sheet — keep the row's value, but
                        # drop a 1,000,000 placeholder typed in by hand
                        new = None if field in PACK_FIELDS and _blank(cur) else cur
                    else:
                        new = value if _blank(cur) else cur
                    if new != cur:
                        setattr(obj, field, new)
                        changed.append(field)
                if changed and obj.pk not in new_ids:
                    obj.updated_at = now
                    to_update[obj.pk] = obj
                    update_fields.update(changed)
                    stat['updated'] += 1
                if replace and obj.pk not in new_ids:
                    replaced_ids.append(obj.pk)
                    line_keys[obj.pk] = set()
                existing = line_keys.setdefault(obj.pk, set())
                stat['kept_lines'] += len(existing)

            for pl in parsed_lines:
                key = (pl['label'].lower(), pl['unit'].pk)
                if key in existing:
                    continue
                existing.add(key)
                new_lines.append(ItemConversionLine(item_conversion=obj, **pl))
                stat['lines'] += 1

        if not opts['dry_run']:
            with transaction.atomic():
                ItemConversion.objects.bulk_create(
                    [o for o in by_sku.values() if o.pk in new_ids],
                    batch_size=500)
                if to_update:
                    ItemConversion.objects.bulk_update(
                        list(to_update.values()), [*update_fields, 'updated_at'], batch_size=500)
                if replaced_ids:
                    ItemConversionLine.objects.filter(item_conversion_id__in=replaced_ids).delete()
                ItemConversionLine.objects.bulk_create(new_lines, batch_size=1000)

        wb.close()
        mode = '[DRY RUN — nothing saved]' if opts['dry_run'] else '[SAVED]'
        self.stdout.write(f'\n{mode}  ({"replace" if replace else "merge"}'
                          f'{", cost skipped" if skip_cost else ""})')
        for k, v in stat.items():
            self.stdout.write(f'  {k:14}: {v}')
