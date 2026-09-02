"""
Seed the WnR (Wok N Roll) branch with a demo menu — 15 dish recipes, their
ingredients, menu lines, and one shared modifier group — so the
Cookbook -> inventory-platform publish + POS-deduction loop can be exercised
end to end for a branch other than Dine.

    python manage.py seed_wnr_demo               # build in Cookbook only
    python manage.py seed_wnr_demo --publish     # also push each to inventory-platform

Idempotent: existing recipes / lines / options are updated in place.

The ingredient SKUs below are the WNR-* items from inventory-platform's
seed_pos_recipes fixture. --publish needs INVENTORY_API_* pointed at a
platform where those items and a matching production store exist, and the
service account must be able to write dish recipes (SUPER_ADMIN).
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.cookbook.models import (
    DishRecipe, DishRecipeIngredient, Branch, Menu, MenuLine, UnitScale,
    ModifierGroup, ModifierOption, ModifierOptionKind, ModifierSelection,
    DishModifierGroup, ModifierRole,
)
from apps.cookbook.services import apply_cost

# sku -> snapshot display name
_ITEM_NAMES = {
    'WNR-SHRIMP': 'Large Shrimp', 'WNR-CN-NOODLES': 'Chinese Egg Noodles',
    'WNR-MIXED-VEG': 'Mixed Vegetables', 'WNR-SOY-SAUCE': 'Soy Sauce',
    'WNR-CHILI-SAUCE': 'Chili Sauce', 'WNR-CORN': 'Sweet Corn', 'b1221': 'chicken breast',
    'WNR-MUSHROOM': 'Mixed Mushroom', 'WNR-TEMP-BATTER': 'Tempura Batter Mix',
    'WNR-POTATO': 'Potato', 'WNR-BEEF': 'Beef Local', 'WNR-RICE': 'Long Grain Rice',
    'WNR-GARLIC': 'Garlic', 'WNR-EDAMAME': 'Edamame Beans', 'WNR-SAUCE': 'Special Sauce',
    'WNR-CRAB': 'Imitation Crab Stick', 'WNR-AVOCADO': 'Avocado',
    'WNR-SUSHI-RICE': 'Sushi Rice', 'WNR-NORI': 'Nori Seaweed Sheet',
}

# name_en, pos_item_name, name_ar, price, [(sku, qty, unit_code)]
_DISHES = [
    ('Spicy Pink Shrimp', 'Spicy Pink Shrimp', 'روبيان بينك حار', '5.950',
     [('WNR-SHRIMP', '0.180', 'Kg'), ('WNR-CHILI-SAUCE', '0.030', 'Kg'), ('WNR-MIXED-VEG', '0.050', 'Kg')]),
    ('Chinese Fried Noodles', 'Chinese Fried Noodles', 'نودلز مقلي صيني', '2.550',
     [('WNR-CN-NOODLES', '0.200', 'Kg'), ('WNR-MIXED-VEG', '0.080', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Chicken Corn Soup', 'Chicken Corn Soup', 'شوربة الدجاج بالذرة', '1.950',
     [('b1221', '0.050', 'Kg'), ('WNR-CORN', '0.100', 'Kg')]),
    ('Hot & Sour Soup', 'Hot & Sour Soup', 'شوربة الحامض الحاره', '1.950',
     [('WNR-MUSHROOM', '0.040', 'Kg'), ('WNR-MIXED-VEG', '0.050', 'Kg'), ('WNR-CHILI-SAUCE', '0.020', 'Kg')]),
    ('Tempura Ebi', 'Tempura Ebi', 'تيمبورا روبيان', '5.200',
     [('WNR-SHRIMP', '0.120', 'Kg'), ('WNR-TEMP-BATTER', '0.040', 'Kg')]),
    ('Spicy Potato', 'Spicy Potato', 'البطاطا الحاره', '3.900',
     [('WNR-POTATO', '0.150', 'Kg'), ('WNR-CHILI-SAUCE', '0.030', 'Kg'), ('WNR-BEEF', '0.100', 'Kg')]),
    ('Japanese Garlic Rice', 'Japanese Garlic Rice', 'أرز ياباني بالثوم', '2.400',
     [('WNR-RICE', '0.150', 'Kg'), ('WNR-GARLIC', '0.020', 'Kg'), ('WNR-SOY-SAUCE', '0.010', 'Kg')]),
    ('Japanese Fry Rice', 'Japanese Fry Rice', 'أرز مقلي ياباني', '2.850',
     [('WNR-RICE', '0.150', 'Kg'), ('WNR-MIXED-VEG', '0.060', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Edamame Spicy', 'Edamame Spicy', 'ادمامي بالفلفل', '2.600',
     [('WNR-EDAMAME', '0.150', 'Kg'), ('WNR-CHILI-SAUCE', '0.020', 'Kg')]),
    ('Crispy Salad', 'Crispy Salad', 'سلطة مقرمشة', '3.200',
     [('WNR-MIXED-VEG', '0.120', 'Kg'), ('WNR-SAUCE', '0.030', 'Kg')]),
    ('Negimayaki', 'Negimayaki', 'نيجمياكي', '4.350',
     [('WNR-BEEF', '0.120', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('California Maki', 'California Maki', 'كاليفورنيا ماكي', '4.400',
     [('WNR-CRAB', '0.050', 'Kg'), ('WNR-AVOCADO', '0.040', 'Kg'), ('WNR-SUSHI-RICE', '0.090', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('Mongolian', 'Mongolian', 'مانغوليان', '6.500',
     [('WNR-BEEF', '0.150', 'Kg'), ('WNR-MIXED-VEG', '0.050', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Japanese Steam Rice', 'Japanese Steam Rice', 'أرز ياباني', '1.300',
     [('WNR-RICE', '0.150', 'Kg')]),
    ('Volcano', 'Volcano', 'فولكينو', '5.500',
     [('WNR-SUSHI-RICE', '0.100', 'Kg'), ('WNR-CRAB', '0.050', 'Kg'), ('WNR-SHRIMP', '0.030', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
]

_MOD_DISHES = {'Chinese Fried Noodles', 'Japanese Fry Rice', 'Spicy Potato', 'Mongolian'}


def _ascii(s):
    return str(s).encode('ascii', 'replace').decode('ascii')


class Command(BaseCommand):
    help = 'Seed the WnR branch with a 15-dish demo menu (recipes + menu lines + a modifier group).'

    def add_arguments(self, parser):
        parser.add_argument('--publish', action='store_true',
                            help='Also publish each recipe to inventory-platform.')
        parser.add_argument('--branch', default='WnR', help='Branch name_en (default: WnR).')

    def handle(self, *args, **opts):
        try:
            branch = Branch.objects.get(name_en__iexact=opts['branch'])
        except Branch.DoesNotExist:
            raise CommandError(f'No branch "{opts["branch"]}". Available: '
                               f'{list(Branch.objects.values_list("name_en", flat=True))}')
        menu = Menu.objects.filter(branch=branch, is_active=True).first()
        if not menu:
            menu = Menu.objects.create(branch=branch, name=f'{branch.name_en} Menu')
            self.stdout.write(f'created menu for {branch.name_en}')

        units = {u.code: u for u in UnitScale.objects.all()}

        with transaction.atomic():
            grp, _ = ModifierGroup.objects.get_or_create(
                name_en='WnR Protein Choice',
                defaults=dict(name_ar='اختيار البروتين', selection=ModifierSelection.SINGLE,
                              min_select=1, max_select=1))
            for i, (nm, delta) in enumerate([('Chicken', '1.000'), ('Beef', '1.500'),
                                             ('Shrimp', '2.000'), ('Veggie', '0.000')]):
                ModifierOption.objects.update_or_create(
                    group=grp, name_en=nm,
                    defaults=dict(price_delta=Decimal(delta), kind=ModifierOptionKind.CHOICE,
                                  pos_mods_string=nm, sort_order=i))

            built = []
            for order, (name_en, pos_name, name_ar, price, ings) in enumerate(_DISHES):
                r = DishRecipe.objects.filter(name_en=name_en, branch_ref=branch, is_current=True).first()
                if r:
                    r.ingredients.all().delete()
                else:
                    r = DishRecipe(name_en=name_en, branch_ref=branch, is_current=True, version=1)
                r.name_ar = name_ar
                r.pos_item_name = pos_name
                r.selling_price = Decimal(price)
                r.include_labor_cost = False
                r.save()
                for j, (sku, qty, ucode) in enumerate(ings):
                    DishRecipeIngredient.objects.create(
                        recipe=r, item_sku=sku, item_name_snapshot=_ITEM_NAMES.get(sku, sku),
                        quantity=Decimal(qty), unit=units[ucode], order=j)
                apply_cost(r)
                r.save()
                MenuLine.objects.update_or_create(
                    menu=menu, dish=r,
                    defaults=dict(pos_name=pos_name, sort_order=order * 10, menu_price=Decimal(price)))
                if name_en in _MOD_DISHES:
                    DishModifierGroup.objects.get_or_create(
                        dish=r, group=grp, defaults=dict(default_role=ModifierRole.FORCED))
                built.append(r)
                self.stdout.write(_ascii(f'  {name_en:26s} cost={r.cost}'
                                         + ('  [+modifier]' if name_en in _MOD_DISHES else '')))

        self.stdout.write(self.style.SUCCESS(f'{len(built)} WnR recipes on the menu.'))

        if not opts['publish']:
            self.stdout.write('run again with --publish to push them to inventory-platform.')
            return

        from apps.cookbook.publishing import publish_dish_recipe, RecipePublishError
        from apps.integrations.inventory_client import InventoryClient
        client = InventoryClient()
        ok = fail = 0
        for r in built:
            try:
                if not r.inventory_recipe_id:
                    row = client.find_dish_recipe(r.name_en)
                    if row:
                        r.inventory_recipe_id = str(row['id'])
                        r.save(update_fields=['inventory_recipe_id'])
                publish_dish_recipe(r, client=client)
                ok += 1
                self.stdout.write(_ascii(f'  published {r.name_en:26s} -> {r.inventory_recipe_id}'))
            except RecipePublishError as e:
                fail += 1
                self.stdout.write(self.style.WARNING(_ascii(f'  FAILED {r.name_en}: {e}')))
        self.stdout.write(self.style.SUCCESS(f'publish: {ok} ok, {fail} failed'))
