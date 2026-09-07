"""
One-off structural backfill for WnR's POS modifiers, ahead of the chef filling
consumption quantities on the Readiness screen.

    python manage.py backfill_wnr_modifiers            # dry run — shows the plan
    python manage.py backfill_wnr_modifiers --commit   # apply

Does only the safe, no-domain-knowledge structural work — every option it
creates is `needs_data` (nothing deducts wrong; it just becomes a visible
worklist row instead of a silent fall-back to the base recipe):
  A. `WnR Protein Choice` options: kind `choice` -> `type` (it is a variant pick).
  C. Attach `WnR Protein Choice` to every current WnR dish that sold a protein
     modifier in the report but has no protein group yet.
  B. For every group attached to a WnR dish, add an option for each exact report
     Mods string on those dishes that no current option matches.
  D. Clear the bogus seed auto-match `SOLTADO / "SOLTADPO BEEF"` -> "Mahalabia".
  E. Set `pos_mods_string` from the report's exact Mods text on any still-blank
     option whose name matches.

Then prints the chef worklist: what still needs a variant recipe / an add-on
delta / a removal delta, and any report Mods with no option anywhere.

Reads `sales-by-item-wnr.xls` from the repo root (override with --report).
"""
import re
from collections import defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.cookbook.models import (
    DishRecipe, DishModifierGroup, ModifierGroup, ModifierOption,
    ModifierOptionKind, ModifierRole, DeductionStatus,
)

PROTEIN_GROUP = 'WnR Protein Choice'
# report Mods that are a protein / variant pick (normalised -> canonical label)
PROTEIN_MODS = {
    'chicken': 'Chicken', 'beef': 'Beef', 'shrimp': 'Shrimp', 'prawn': 'Prawn',
    'veggie': 'Veggie', 'veghie': 'Veggie', 'plain': 'Plain', 'angus beef': 'ANGUS Beef',
}


def _norm(s):
    s = re.sub(r'^\s*[\(\[][^)\]]*[\)\]]\s*', '', str(s or ''))
    return ' '.join(s.split('/')[0].split()).casefold()


def _ascii(s):
    return str(s).encode('ascii', 'replace').decode('ascii')


def parse_report(path):
    raw = Path(path).read_bytes()
    text = raw.decode('utf-16', 'replace').lstrip('﻿')
    lines = text.strip().splitlines()
    hdr = [h.strip().lower() for h in lines[0].split('\t')]
    qi = next(i for i, h in enumerate(hdr) if 'quantity' in h)
    ii = next(i for i, h in enumerate(hdr) if h == 'item')
    mi = next(i for i, h in enumerate(hdr) if h == 'mods')
    by_item = defaultdict(set)
    for ln in lines[1:]:
        c = ln.split('\t')
        if len(c) <= max(qi, ii, mi):
            continue
        try:
            if float(c[qi]) <= 0:
                continue
        except ValueError:
            continue
        mod = c[mi].strip()
        if mod:
            by_item[c[ii].split('/')[0].strip()].add(mod)
    return by_item


class Command(BaseCommand):
    help = 'Structural backfill for WnR POS modifiers (safe changes only) + chef worklist.'

    def add_arguments(self, parser):
        parser.add_argument('--commit', action='store_true')
        parser.add_argument('--report', default='sales-by-item-wnr.xls')

    def handle(self, *args, **opts):
        report_path = opts['report']
        if not Path(report_path).exists():
            # try repo root (three levels up from this file's app)
            root = Path(__file__).resolve().parents[5]
            report_path = root / opts['report']
        if not Path(report_path).exists():
            raise CommandError(f'Report not found: {opts["report"]}')

        commit = opts['commit']
        w = self.stdout.write
        by_item = parse_report(report_path)

        wnr_dishes = list(DishRecipe.objects.filter(is_current=True).filter(
            Q(branch_ref__name_en__iexact='WnR') | Q(branch__iexact='WnR')))
        dish_by_norm = {}
        for d in wnr_dishes:
            dish_by_norm.setdefault(_norm(d.name_en), d)
            if d.pos_item_name:
                dish_by_norm.setdefault(_norm(d.pos_item_name), d)

        changes = []
        notices = []

        with transaction.atomic():
            grp = ModifierGroup.objects.filter(name_en=PROTEIN_GROUP).first()
            if not grp:
                raise CommandError(f'Group "{PROTEIN_GROUP}" not found — run import_pos_menu first.')

            # ── A. choice -> type on the protein group ───────────────────────
            flipped = grp.options.filter(kind=ModifierOptionKind.CHOICE)
            for o in flipped:
                changes.append(f'A  {PROTEIN_GROUP} / {o.name_en!r}: choice -> type')
            flipped.update(kind=ModifierOptionKind.TYPE)

            # ── C. attach the protein group to bare WnR dishes ──────────────
            protein_items = {
                it for it, mods in by_item.items()
                if any(_norm(m) in PROTEIN_MODS for m in mods)
            }
            for item in sorted(protein_items):
                dish = dish_by_norm.get(_norm(item))
                if not dish:
                    notices.append(f'report item {_ascii(item)!r}: no current WnR recipe — cannot attach')
                    continue
                if DishModifierGroup.objects.filter(dish=dish, group=grp).exists():
                    continue
                # already has some other protein-ish group? leave it
                other = DishModifierGroup.objects.filter(
                    dish=dish, group__name_en__icontains='protein').exclude(group=grp)
                if other.exists():
                    continue
                changes.append(f'C  {dish.name_en}: attach {PROTEIN_GROUP} [forced]')
                DishModifierGroup.objects.get_or_create(
                    dish=dish, group=grp, defaults={'default_role': ModifierRole.FORCED})

            # ── B. add a `needs_data` option for every uncovered report Mods ──
            # (runs after A + C so freshly-attached / re-typed groups are seen)
            dish_mods = defaultdict(set)   # report Mods per WnR dish id
            for item, mods in by_item.items():
                d = dish_by_norm.get(_norm(item))
                if d:
                    dish_mods[d.id] |= mods
            # distinct groups on WnR dishes -> union of the Mods across those dishes
            group_mods = defaultdict(set)
            for dmg in DishModifierGroup.objects.select_related('group').filter(
                    Q(dish__branch_ref__name_en__iexact='WnR') | Q(dish__branch__iexact='WnR')):
                group_mods[dmg.group_id] |= dish_mods.get(dmg.dish_id, set())
            for gid, mods in group_mods.items():
                g = ModifierGroup.objects.prefetch_related('options').get(pk=gid)
                covered = set()
                kinds = set()
                for o in g.options.all():
                    covered.add(_norm(o.name_en))
                    if o.pos_mods_string:
                        covered.add(_norm(o.pos_mods_string))
                    kinds.add(o.kind)
                if g.name_en == PROTEIN_GROUP:
                    kinds.add(ModifierOptionKind.TYPE)   # step A re-typed these
                new_kind = (ModifierOptionKind.TYPE if ModifierOptionKind.TYPE in kinds
                            else ModifierOptionKind.ADDON if ModifierOptionKind.ADDON in kinds
                            else ModifierOptionKind.CHOICE)
                for m in sorted(mods):
                    parts = [m] + [p.strip() for p in re.split(r'\s*[-,]\s*', m) if p.strip()]
                    if any(_norm(p) in covered for p in parts):
                        continue
                    covered.add(_norm(m))
                    changes.append(f'B  {g.name_en}: + option {m!r} ({new_kind}, needs data)')
                    ModifierOption.objects.create(
                        group=g, name_en=m[:160], kind=new_kind,
                        pos_mods_string=m[:255], sort_order=99)

            # ── D. clear the bogus SOLTADO -> Mahalabia auto-match ──────────
            for o in ModifierOption.objects.filter(
                    variant_recipe__name_en='Mahalabia').exclude(group__name_en__icontains='mahalabia'):
                changes.append(f'D  {o.group.name_en} / {o.name_en!r}: clear bogus variant -> Mahalabia')
                o.variant_recipe = None
                o.save(update_fields=['variant_recipe', 'updated_at'])

            # ── E. fill blank pos_mods_string from an exact report match ────
            all_report_mods = {m for ms in by_item.values() for m in ms}
            mod_by_norm = {}
            for m in all_report_mods:
                mod_by_norm.setdefault(_norm(m), m)
            for o in ModifierOption.objects.filter(pos_mods_string='').select_related('group'):
                if not o.group.dish_uses.filter(
                        Q(dish__branch_ref__name_en__iexact='WnR') | Q(dish__branch__iexact='WnR')).exists():
                    continue
                hit = mod_by_norm.get(_norm(o.name_en))
                if hit:
                    changes.append(f'E  {o.group.name_en} / {o.name_en!r}: pos_mods_string = {hit!r}')
                    o.pos_mods_string = hit
                    o.save(update_fields=['pos_mods_string', 'updated_at'])

            # report + worklist run INSIDE the txn so a dry run still shows the
            # post-change state (then it's all rolled back)
            w(self.style.MIGRATE_HEADING(
                f'\n== WnR modifier backfill {"(APPLIED)" if commit else "(dry run — nothing saved)"} =='))
            for c in (changes or ['no structural changes needed']):
                w(f'  {_ascii(c)}')
            for n in notices:
                w(self.style.WARNING(f'  ~ {n}'))
            w(self.style.MIGRATE_HEADING('\n== Chef worklist (fill on the Readiness screen) =='))
            self._worklist(by_item, dish_by_norm)

            if not commit:
                transaction.set_rollback(True)

    def _worklist(self, by_item, dish_by_norm):
        w = self.stdout.write
        need_variant, need_addon, need_removal, no_option = [], [], [], []
        for item, mods in sorted(by_item.items()):
            dish = dish_by_norm.get(_norm(item))
            if not dish:
                continue
            links = DishModifierGroup.objects.filter(dish=dish).select_related('group')
            opts = {}
            for l in links:
                for o in l.group.options.all():
                    opts[_norm(o.name_en)] = o
                    if o.pos_mods_string:
                        opts[_norm(o.pos_mods_string)] = o
            for m in sorted(mods):
                o = opts.get(_norm(m)) or next(
                    (opts.get(_norm(p)) for p in re.split(r'\s*[-,]\s*', m) if _norm(p) in opts), None)
                if o is None:
                    no_option.append(f'{_ascii(item)} [{_ascii(m)}]')
                    continue
                if o.no_consumption_impact or o.deduction_status == DeductionStatus.READY:
                    continue
                tag = f'{_ascii(item)} [{_ascii(m)}]  ({o.group.name_en} / {o.name_en})'
                if o.kind == ModifierOptionKind.TYPE:
                    need_variant.append(tag)
                elif o.kind == ModifierOptionKind.ADDON:
                    need_addon.append(tag)
                elif o.kind == ModifierOptionKind.INSTRUCTION:
                    need_removal.append(tag)
                else:
                    need_variant.append(tag)

        for title, rows in [
            ('needs a variant recipe OR "+protein" delta (or "no stock impact")', need_variant),
            ('needs an add-on ingredient delta', need_addon),
            ('needs a removal ingredient delta (or "no stock impact")', need_removal),
            ('no matching option on any attached group — attach/author one', no_option),
        ]:
            w(self.style.WARNING(f'\n  {title}  ({len(rows)})'))
            for r in sorted(set(rows))[:40]:
                w(f'      {r}')
