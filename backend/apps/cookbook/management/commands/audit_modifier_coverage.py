"""
Cross-check a real Lavu "Sales by Item" report against modifier readiness.

    python manage.py audit_modifier_coverage "sales-by-item-wnr.xls" --branch WnR

For every distinct (item, modifier) pair that actually sold, says whether the
POS-modifier pipeline would deduct it correctly today, or exactly what data is
missing. This is the worklist for closing gaps — nothing is glossed over.

Read-only. Does not touch inventory-platform.
"""
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.cookbook.models import (
    DishRecipe, DishModifierGroup, ModifierOptionKind, DeductionStatus,
)


def _ascii(s):
    return str(s).encode('ascii', 'replace').decode('ascii')


def _num(s):
    s = re.sub(r'[^\d.]', '', str(s or ''))
    try:
        return Decimal(s) if s else Decimal('0')
    except InvalidOperation:
        return Decimal('0')


def parse_lavu(path):
    """Minimal Lavu 'Sales by Item' reader (UTF-16 TSV). Yields dicts with
    item_en, modifier, qty, item_total, mod_price. Mirrors inventory-platform's
    apps.pos_integration.services.parse_pos_report."""
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('utf-16')
    except UnicodeError:
        text = raw.decode('utf-8', 'replace')
    text = text.lstrip('﻿')
    lines = text.strip().splitlines()
    if not lines:
        raise CommandError('Empty file.')
    header = [h.strip().lower() for h in lines[0].split('\t')]

    def col(pred):
        return next((i for i, h in enumerate(header) if pred(h)), None)

    qi = col(lambda h: 'quantity' in h)
    ii = col(lambda h: h == 'item')
    ti = col(lambda h: 'item total' in h)
    mi = col(lambda h: h == 'mods')
    mpi = col(lambda h: h == 'modifiers')
    if None in (qi, ii, ti):
        raise CommandError(f'Unrecognised header: {header}')

    for line in lines[1:]:
        c = line.split('\t')
        if len(c) <= max(qi, ii, ti):
            continue
        try:
            qty = Decimal(c[qi].strip())
        except InvalidOperation:
            continue
        if qty <= 0 or not c[ii].strip():
            continue
        yield {
            'item_en': c[ii].split('/')[0].strip(),
            'modifier': c[mi].strip() if mi is not None and mi < len(c) else '',
            'qty': qty,
            'item_total': _num(c[ti]) if ti < len(c) else Decimal('0'),
            'mod_price': _num(c[mpi]) if mpi is not None and mpi < len(c) else Decimal('0'),
        }


def _norm(s):
    s = re.sub(r'^\s*[\(\[][^)\]]*[\)\]]\s*', '', str(s or ''))
    return ' '.join(s.split()).casefold()


class Command(BaseCommand):
    help = 'Audit a Lavu sales report against POS-modifier deduction readiness.'

    def add_arguments(self, parser):
        parser.add_argument('file')
        parser.add_argument('--branch', default='', help='Branch name_en to scope dish lookup.')

    def handle(self, *args, **opts):
        try:
            rows = list(parse_lavu(opts['file']))
        except FileNotFoundError:
            raise CommandError(f'File not found: {opts["file"]}')

        agg = defaultdict(lambda: {'qty': Decimal('0'), 'it': Decimal('0'), 'mp': Decimal('0')})
        for r in rows:
            k = (r['item_en'], r['modifier'])
            agg[k]['qty'] += r['qty']
            agg[k]['it'] = r['item_total']
            agg[k]['mp'] = r['mod_price']

        branch = opts['branch']
        dish_qs = DishRecipe.objects.filter(is_current=True)
        if branch:
            dish_qs = dish_qs.filter(Q(branch_ref__name_en__iexact=branch) | Q(branch__iexact=branch))

        def find_dish(name):
            n = name.casefold()
            return (dish_qs.filter(pos_item_name__iexact=name).first()
                    or dish_qs.filter(name_en__iexact=name).first()
                    or next((d for d in dish_qs if d.name_en.casefold() == n), None))

        buckets = defaultdict(list)
        for (item, mod), v in sorted(agg.items()):
            dish = find_dish(item)
            tag = f'{_ascii(item)} [{_ascii(mod)}] x{int(v["qty"])}'

            if not mod:
                if not dish:
                    buckets['NO RECIPE - 0 deduction'].append(tag)
                elif not dish.ingredients.exists():
                    buckets['recipe has no ingredients'].append(tag)
                else:
                    buckets['OK - base'].append(tag)
                continue

            if not dish:
                buckets['NO RECIPE for the item - 0 deduction'].append(tag)
                continue

            # find the modifier option on one of this dish's attached groups
            links = DishModifierGroup.objects.filter(dish=dish).select_related('group').prefetch_related(
                'group__options__deltas', 'group__options__variant_recipe')
            opt = None
            for l in links:
                for o in l.group.options.all():
                    if _norm(o.pos_mods_string) == _norm(mod) or _norm(o.name_en) == _norm(mod):
                        opt = o
                        break
                if opt:
                    break

            if opt is None:
                # compound? try each part
                parts = [p for p in re.split(r'\s*[-,/]\s*', mod) if p]
                matched_parts = []
                for l in links:
                    for o in l.group.options.all():
                        if any(_norm(o.name_en) == _norm(p) or _norm(o.pos_mods_string) == _norm(p)
                               for p in parts):
                            matched_parts.append(o.name_en)
                if matched_parts:
                    buckets[f'compound - matches parts {matched_parts[:3]}'].append(tag)
                else:
                    buckets['NO OPTION on any attached group - falls back to base'].append(tag)
                continue

            st = opt.deduction_status
            if st == DeductionStatus.READY:
                buckets['OK - modifier effect defined'].append(tag)
            elif st == DeductionStatus.NO_IMPACT:
                buckets['OK - modifier marked no stock impact'].append(tag)
            else:
                reason = (opt.missing or ['needs data'])[0]
                buckets[f'NEEDS DATA - {reason}'].append(tag)

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n== Modifier coverage audit — {len(agg)} distinct (item, modifier) pairs, '
            f'{sum(int(v["qty"]) for v in agg.values())} units sold =='))
        for name, items in sorted(buckets.items(), key=lambda kv: (not kv[0].startswith('OK'), -len(kv[1]))):
            style = self.style.SUCCESS if name.startswith('OK') else self.style.WARNING
            self.stdout.write(style(f'\n{name}  ({len(items)} pairs)'))
            for it in items[:40]:
                self.stdout.write(f'    {it}')
            if len(items) > 40:
                self.stdout.write(f'    ...+{len(items) - 40} more')
