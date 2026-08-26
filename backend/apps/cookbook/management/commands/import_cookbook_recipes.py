"""
Import the authored dishes from "200 Lebanese Menu Cook Book.xlsm" into Cookbook
DishRecipe rows (identity + scalars from the "Menu To DOR" sheet, ingredient
SKUs from the "Recipe" sheet, matched by English name).

    python manage.py import_cookbook_recipes --file "200 Lebanese Menu Cook Book.xlsm"
    python manage.py import_cookbook_recipes --file "..." --dry-run

Idempotent on recipe_code (falls back to name_en). Recomputes cost after import
using the Stage-2 engine — run `cookbook_costing_report` afterwards to diff
against the sheet's own numbers.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.cookbook.models import (
    Approver, Branch, DishRecipe, DishRecipeIngredient, DishRecipeStep,
    DishStandard, MenuCategory, Section, UnitScale,
)
from apps.cookbook.recipe_sheet import (
    parse_dish_standards, parse_menu_to_dor, parse_recipe_blocks,
)
from apps.cookbook.services import apply_cost, get_inventory_items_by_sku


class Command(BaseCommand):
    help = 'Import authored dishes from the Lebanese Menu Cook Book workbook.'

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True)
        parser.add_argument('--branch', default='Dine',
                            help='Branch for dishes whose revision string has no branch segment '
                                 '(this workbook is the Dine cook book).')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        import openpyxl

        wb = openpyxl.load_workbook(opts['file'], read_only=True, data_only=True)
        dishes = parse_menu_to_dor(wb['Menu To DOR'])
        blocks = parse_recipe_blocks(wb['Recipe'])
        standards = parse_dish_standards(wb['Dish Standards Database']) if 'Dish Standards Database' in wb.sheetnames else {}
        wb.close()

        inv = get_inventory_items_by_sku()      # fetch once, reuse for every recipe
        self.stdout.write(f'inventory items available: {len(inv)}')

        cats = {c.name.lower(): c for c in MenuCategory.objects.all()}
        sections = {s.name.lower(): s for s in Section.objects.all()}
        branches = {b.name_en.lower(): b for b in Branch.objects.all()}
        units = {u.code.lower(): u for u in UnitScale.objects.all()}
        approvers = list(Approver.objects.all())

        def find_approver(name):
            name = (name or '').strip()
            if not name:
                return None
            for a in approvers:
                if a.name.lower() == name.lower():
                    return a
            for a in approvers:
                if name.lower() in a.name.lower() or a.name.lower() in name.lower():
                    return a
            return None

        stat = dict(dishes=0, created=0, updated=0, ingredients=0, no_block=0,
                    skipped_ings=0, bad_unit=set())

        with transaction.atomic():
            for d in dishes:
                stat['dishes'] += 1
                block = blocks.get(d['name_en'], {})
                if not block:
                    stat['no_block'] += 1
                ing_rows = block.get('ingredients', [])

                lookup = {'recipe_code': d['recipe_code']} if d['recipe_code'] else {'name_en': d['name_en']}
                branch = d['branch'] or opts['branch']
                fields = {
                    'name_en': d['name_en'],
                    'name_ar': d['name_ar'],
                    'recipe_code': d['recipe_code'],
                    'revision': d['revision'],
                    'branch': branch,
                    'branch_ref': branches.get(branch.lower()),
                    'category': cats.get(d['category'].lower()),
                    'section': sections.get(d['section'].lower()),
                    'selling_price': d['price'],
                    'prep_time_minutes': int(d['prep_time_minutes']) if d['prep_time_minutes'] else None,
                    'expected_waste_pct': d['expected_waste_pct'],
                    'rating': d['rating'],
                    'rating_status': d['rating_status'] if d['rating_status'] in ('ok', 'attention', 'fix') else '',
                    'rating_date': d['rating_date'] if hasattr(d['rating_date'], 'year') else None,
                    'taste_profile': block.get('taste_profile', ''),
                    'approved_by': find_approver(block.get('exec_approver')),
                    'qa_approved_by': find_approver(block.get('qa_approver')),
                    'include_labor_cost': True,
                }

                if opts['dry_run']:
                    tag = 'update' if DishRecipe.objects.filter(**lookup).exists() else 'create'
                    self.stdout.write(f'  [{tag}] {d["name_en"]:28} code={d["recipe_code"] or "-":10} '
                                      f'ings={len(ing_rows)} sec={d["section"]}')
                    for ing in ing_rows:
                        if ing['unit'] and ing['unit'].lower() not in units:
                            stat['bad_unit'].add(ing['unit'])
                    continue

                recipe = DishRecipe.objects.filter(**lookup).first()
                if recipe:
                    for k, v in fields.items():
                        setattr(recipe, k, v)
                    stat['updated'] += 1
                else:
                    recipe = DishRecipe(**fields)
                    stat['created'] += 1
                if recipe.pk:
                    recipe.ingredients.all().delete()
                    recipe.steps.all().delete()

                usable = []
                for ing in ing_rows:
                    unit = units.get((ing['unit'] or '').lower()) or units.get((ing['base_unit'] or '').lower())
                    if unit is None:
                        stat['skipped_ings'] += 1
                        if ing['unit']:
                            stat['bad_unit'].add(ing['unit'])
                        continue
                    usable.append((ing, unit))

                ing_dicts = [{
                    'item_sku': ing['item_sku'], 'quantity': ing['quantity'] or 0,
                    'unit': str(unit.id), 'item_name_snapshot': ing['item_name_snapshot'],
                    'prep_note': ing['prep_note'], 'order': i + 1,
                } for i, (ing, unit) in enumerate(usable)]

                apply_cost(recipe, ing_dicts, items_by_sku=inv)
                recipe.save()

                for i, (ing, unit) in enumerate(usable):
                    DishRecipeIngredient.objects.create(
                        recipe=recipe, order=i + 1, item_sku=ing['item_sku'],
                        item_name_snapshot=ing['item_name_snapshot'], prep_note=ing['prep_note'],
                        quantity=ing['quantity'] or 0, unit=unit,
                    )
                    stat['ingredients'] += 1
                for i, instr in enumerate(d['steps']):
                    DishRecipeStep.objects.create(recipe=recipe, step_number=i + 1, instruction=instr)

                std = standards.get(d['name_en'])
                if std and (std['approval_date'] or std['revision']):
                    DishStandard.objects.update_or_create(
                        dish_recipe=recipe,
                        defaults={'approval_date': std['approval_date']},
                    )

            if opts['dry_run']:
                transaction.set_rollback(True)

        self.stdout.write('\n' + ('[DRY RUN]' if opts['dry_run'] else '[SAVED]'))
        for k, v in stat.items():
            self.stdout.write(f'  {k:12}: {sorted(v) if isinstance(v, set) else v}')
