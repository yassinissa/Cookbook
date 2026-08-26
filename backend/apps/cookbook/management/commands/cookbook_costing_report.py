"""
Compare Cookbook's recomputed cost-per-serving for every imported dish against
the number in the source workbook's "Menu To DOR" sheet.

    python manage.py cookbook_costing_report --file "200 Lebanese Menu Cook Book.xlsm"

The Stage-3 gate: >= 90 % of dishes within 1 fil (0.001 KWD) of the sheet.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.cookbook.models import DishRecipe
from apps.cookbook.recipe_sheet import parse_menu_to_dor
from apps.cookbook.services import apply_cost, get_inventory_items_by_sku

TOLERANCE = Decimal('0.001')


class Command(BaseCommand):
    help = 'Diff recomputed dish costs against the cook book sheet.'

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True)
        parser.add_argument('--recompute', action='store_true',
                            help='Recompute now instead of reading the stored cost.')

    def handle(self, *args, **opts):
        import openpyxl

        wb = openpyxl.load_workbook(opts['file'], read_only=True, data_only=True)
        sheet = {d['name_en']: d for d in parse_menu_to_dor(wb['Menu To DOR'])}
        wb.close()

        inv = get_inventory_items_by_sku() if opts['recompute'] else {}

        rows, within, issues_total = [], 0, 0
        for recipe in DishRecipe.objects.filter(is_current=True).order_by('name_en'):
            src = sheet.get(recipe.name_en)
            if not src or src['menu_to_dor_cost'] is None:
                continue

            if opts['recompute']:
                apply_cost(recipe, items_by_sku=inv)
            computed = Decimal(str((recipe.cost_breakdown or {}).get('per_serving') or recipe.cost))
            excel = src['menu_to_dor_cost']
            diff = (computed - excel).copy_abs()
            ok = diff <= TOLERANCE
            within += ok
            bd_issues = (recipe.cost_breakdown or {}).get('issues', [])
            issues_total += len(bd_issues)
            rows.append((recipe.name_en, excel, computed, diff, ok, bd_issues))

        w = max((len(r[0]) for r in rows), default=10)
        self.stdout.write(f'\n{"dish":{w}}  {"sheet":>9}  {"computed":>9}  {"diff":>8}  issues')
        self.stdout.write('-' * (w + 42))
        for name, excel, computed, diff, ok, iss in rows:
            mark = '  ' if ok else '!!'
            note = '' if not iss else '  ' + ', '.join(f'{i["sku"]}:{i["status"]}' for i in iss[:4])
            self.stdout.write(f'{mark}{name:{w}}  {excel:9.4f}  {computed:9.4f}  {diff:8.4f}{note}')

        n = len(rows)
        pct = (within / n * 100) if n else 0
        self.stdout.write('-' * (w + 42))
        self.stdout.write(f'{within}/{n} within 1 fil ({pct:.0f}%)   |   {issues_total} unresolved ingredient lines')
        self.stdout.write('GATE: ' + ('PASS' if pct >= 90 else 'FAIL') + ' (target 90%)')
