"""
One-off: bring Sando's POS names and modifier options in line with what Lavu
really prints ("sando sales with mod.xls", 2026-11-01). Inventory-platform
matches on that text, misspellings included, and the POS can't be changed.

Every step states the value it expects to find. If the live row has moved on
(the team is editing this data too) the step is skipped and reported, never
overwritten. Safe to run twice: what's already right is reported as done.

Dry-run by default; pass --commit to write. All-or-nothing per run.

    python manage.py fix_sando_pos_data
    python manage.py fix_sando_pos_data --commit
"""
from django.db import transaction

from apps.cookbook.audit import AuditedCommand, diff, record
from apps.cookbook.models import (
    ActivityActionType, ActivityArea, Branch, DishModifierGroup, DishRecipe, ModifierGroup,
    ModifierOption, ModifierOptionIngredient, UnitScale,
)

BRAND = 'sando'

# dish (English name): (POS name now, POS name Lavu prints)
POS_NAMES = {
    'Soft Drinks': ('Soft Drinks/مشروبات غازيه', '92.Soft Drinks/مشروبات غازيه'),
    'Mineral Water': ('Mineral Water/مياه معدنيه', '93.Mineral Water/مياه معدنيه'),
    'Spicy Bean Calzone': ('Spicy BeaCalzone/سبايســـي بn يـــن كالـــزون',
                           'Spicy Bean Calzone/سبايســـي بيـــن كالـــزون'),
    # Lavu has two items with this English name (1.000 and 3.750 KWD). Inventory
    # tells them apart only by the full text, so this one carries all of it.
    'Mini Spinach Manakish': ('Mini Spinach/ميني سبانخ',
                              'Mini Spinach / ميني سبانخ (Mini Spinach/ميني سبانخ)'),
}

# group: option (English name), POS text now, POS text Lavu prints
POS_TEXTS = [
    ('Sando-Baked Potato-Add Ons', 'Add Sour Sauce', 'Add Sour Sauce', 'Add Souce Sauce'),
    ('Sando-Baked Potato-Choices', 'Chili Meat', 'Chili Meat', 'Chili'),
    ('Sando-Chicken Slider-Options', 'Chicken Slider', 'Dairy Special Sauce', 'Dairy Specail Sauce'),
    ('Sando-Burrito Add-Ons', 'Spicy Mayo', 'Spicy Mayo', 'Spicy Mayonnaise'),
    ('Sando-Chop Chop-Add Ons', 'Add Chopped Lettuce', 'Add Chopped Lettuce', 'Add Chopped Lattuce'),
    ('Sando-Chop Chop-Add Ons', 'Add Kitchup', 'Add Kitchup', 'Add Ketchup'),
    ('Sando-Burger Add-Ons', 'Add Kitchup', 'Add Kitchup', 'Add Ketchup'),
    ('Sando-Burger Add-Ons', 'Mustard', 'Mustard', 'Add Mustard'),
    ('Sando-Pepper Burger-Options', 'Extra Sauce', 'Extra Sauce', 'Extra Suace'),
    ('Sando-Bun Choice', 'Milk Bun', 'Burger', 'Milk Bun'),
    ('Sando-Bun Choice', 'Sesame Bun', 'Burger', 'Sesame Bun'),
]

# Lavu spells the sesame bun three ways; each needs its own option, with the
# same swap as "Sesame Bun"
BUN_GROUP = 'Sando-Bun Choice'
BUN_SPELLINGS = ['Seame Bun', 'White Sesame Bun']

# group, dish (English name)
ATTACH = [(BUN_GROUP, 'Fried Chicken Bun')]

# group, option, (sku, direction) now -> sku + its name
DELTAS = [
    ('Sando-Pastrami Arabic-Options', 'Pastrami (Arabic)', ('B291', 'remove'), 'B29', 'Mayonnaise C4'),
]


class Command(AuditedCommand):
    help = "Align Sando's POS names and modifier options with Lavu's sales report."

    def add_arguments(self, parser):
        parser.add_argument('--commit', action='store_true', help='Actually write (default: dry run).')

    def handle(self, *args, **opts):
        self.commit = opts['commit']
        self.changed, self.done, self.skipped = 0, 0, []
        self.branch = Branch.objects.get(slug=BRAND)

        with transaction.atomic():
            self._pos_names()
            self._pos_texts()
            self._bun_spellings()
            self._attach()
            self._deltas()
            if not self.commit:
                transaction.set_rollback(True)

        self.stdout.write('')
        verb = 'Changed' if self.commit else 'Would change'
        self.stdout.write(self.style.SUCCESS(f'{verb} {self.changed}, already right {self.done}.'))
        for line in self.skipped:
            self.stdout.write(self.style.WARNING(f'  SKIPPED {line}'))
        if not self.commit:
            self.stdout.write(self.style.WARNING('DRY RUN — nothing saved. Re-run with --commit.'))

    # ── steps ────────────────────────────────────────────────────────────

    def _say(self, text):
        self.changed += 1
        self.stdout.write(f'  {text}')

    def _log(self, subject_type, obj, label, description, before, after, prefix):
        record('system', area=ActivityArea.POS, action=ActivityActionType.UPDATED,
               subject_type=subject_type, subject_id=obj.pk, label=label,
               description=description, changes=diff(prefix, before, after), branch=self.branch)

    def _pos_names(self):
        for name, (was, now) in POS_NAMES.items():
            dish = DishRecipe.objects.filter(branch_ref=self.branch, is_current=True, name_en=name).first()
            if dish is None:
                self.skipped.append(f'POS name: no dish "{name}"')
            elif dish.pos_item_name == now:
                self.done += 1
            elif dish.pos_item_name != was:
                self.skipped.append(f'POS name of {name}: expected "{was}", found "{dish.pos_item_name}"')
            else:
                dish.pos_item_name = now
                dish.save(update_fields=['pos_item_name', 'updated_at'])
                self._log('dish', dish, name, 'POS name set to what Lavu prints',
                          {'pos_item_name': was}, {'pos_item_name': now}, 'dish')
                self._say(f'POS name  {name}: {was} -> {now}')

    def _option(self, group, name):
        return ModifierOption.objects.filter(group__name_en=group, name_en=name).first()

    def _pos_texts(self):
        for group, name, was, now in POS_TEXTS:
            opt = self._option(group, name)
            if opt is None:
                self.skipped.append(f'POS text: no option "{name}" in {group}')
            elif opt.pos_mods_string == now:
                self.done += 1
            elif opt.pos_mods_string != was:
                self.skipped.append(f'POS text of {group} / {name}: expected "{was}", '
                                    f'found "{opt.pos_mods_string}"')
            else:
                opt.pos_mods_string = now
                opt.save(update_fields=['pos_mods_string', 'updated_at'])
                self._log('modifier_group', opt.group, group, f'POS text of {name} set to what Lavu prints',
                          {'pos_mods_string': was}, {'pos_mods_string': now}, f'option.{name}')
                self._say(f'POS text  {group} / {name}: {was} -> {now}')

    def _bun_spellings(self):
        source = self._option(BUN_GROUP, 'Sesame Bun')
        if source is None:
            self.skipped.append(f'bun options: no "Sesame Bun" in {BUN_GROUP}')
            return
        deltas = list(source.deltas.all())
        for spelling in BUN_SPELLINGS:
            if self._option(BUN_GROUP, spelling):
                self.done += 1
                continue
            opt = ModifierOption.objects.create(
                group=source.group, name_en=spelling, name_ar=source.name_ar, kind=source.kind,
                price_delta=source.price_delta, pos_mods_string=spelling,
                sort_order=source.sort_order)
            for d in deltas:
                ModifierOptionIngredient.objects.create(
                    option=opt, item_sku=d.item_sku, item_name_snapshot=d.item_name_snapshot,
                    quantity=d.quantity, unit=d.unit, direction=d.direction, sort_order=d.sort_order)
            self._log('modifier_group', source.group, BUN_GROUP, f'Option added: {spelling}',
                      {}, {'pos_mods_string': spelling}, f'option.{spelling}')
            self._say(f'Option    {BUN_GROUP}: added {spelling} (same swap as Sesame Bun)')

    def _attach(self):
        for group_name, dish_name in ATTACH:
            group = ModifierGroup.objects.filter(name_en=group_name).first()
            dish = DishRecipe.objects.filter(branch_ref=self.branch, is_current=True,
                                             name_en=dish_name).first()
            if group is None or dish is None:
                self.skipped.append(f'attach: no "{group_name}" or no "{dish_name}"')
                continue
            _, created = DishModifierGroup.objects.get_or_create(dish=dish, group=group)
            if not created:
                self.done += 1
                continue
            self._log('dish', dish, dish_name, f'Modifier group attached: {group_name}',
                      {}, {'group': group_name}, 'dish')
            self._say(f'Attach    {group_name} -> {dish_name}')

    def _deltas(self):
        for group, name, (was_sku, direction), now_sku, now_name in DELTAS:
            opt = self._option(group, name)
            if opt is None:
                self.skipped.append(f'stock line: no option "{name}" in {group}')
                continue
            if opt.deltas.filter(item_sku=now_sku, direction=direction).exists():
                self.done += 1
                continue
            delta = opt.deltas.filter(item_sku=was_sku, direction=direction).first()
            if delta is None:
                self.skipped.append(f'stock line of {group} / {name}: no {direction} of {was_sku}')
                continue
            delta.item_sku, delta.item_name_snapshot = now_sku, now_name
            delta.save(update_fields=['item_sku', 'item_name_snapshot', 'updated_at'])
            self._log('modifier_group', opt.group, group, f'{name}: {direction} {was_sku} -> {now_sku}',
                      {'item_sku': was_sku}, {'item_sku': now_sku}, f'option.{name}')
            self._say(f'Stock     {group} / {name}: {direction} {was_sku} -> {now_sku} ({now_name})')
