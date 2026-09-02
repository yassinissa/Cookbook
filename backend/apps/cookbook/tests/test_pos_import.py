"""
`manage.py import_pos_menu` — parsing the POSLavu QA workbook into
ModifierGroup / ModifierOption / DishModifierGroup / MenuLineModifier.

Builds a tiny in-memory workbook with the three sheets the real file has and
pins: the EN/AR name split + marker-row drop, the kind guess, the
selection/min/max inference, the dish + menu-line attach, undefined groups,
idempotency, and --dry-run.
"""
import tempfile
from decimal import Decimal
from pathlib import Path

from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.cookbook.models import (
    Branch, DishRecipe, Menu, MenuCategory, MenuLine,
    ModifierGroup, ModifierOption, ModifierOptionKind, ModifierRole,
    ModifierSelection, DishModifierGroup, MenuLineModifier,
)

# rows are (No., Item(EN/AR), Price, List, "Add Item")
FORCED_ROWS = [
    ('1', 'Chicken/دجاج',        5.45, 'RoLL',  'Add Item'),
    ('2', 'Lamb/لحم',            6.70, 'RoLL',  'Add Item'),
    ('3', 'Garlic Sauce/صلصة',   0.25, 'RoLL',  'Add Item'),
    ('4', 'RoLL',                None, 'RoLL',  ''),            # marker: name == group
    ('5', 'Spicy/بالفلفل',       0,    'Mono',  'Add Item'),
    ('6', 'Regular/عادي',        0,    'Mono',  'Add Item'),
    ('7', '6 Selections Only',   0,    'Big Set', 'Add Item'),  # marker → max_select 6
    ('8', 'Egg Selection *****', 0,    'Big Set', 'Add Item'),  # marker
    ('9', 'Sunny Side Up/بيض',   0,    'Big Set', 'Add Item'),
    ('10', 'Omelet/اومليت',      0,    'Big Set', 'Add Item'),
]
# optional sheet
OPTIONAL_ROWS = [
    ('20', 'Mushroom/مشروم',        0.75, 'Egg Addition', ''),
    ('21', 'Extra Cheese/جبن',      1.00, 'Egg Addition', ''),
    ('22', 'Without Chicken/بدون دجاج', 0, 'Egg Addition', ''),   # instruction
]
# menu sheet rows are (No., Name(EN/AR), Price, Category, Optional Mod, Forced Mod, ...)
MENU_ROWS = [
    ('1', 'Meat Arayes/عرايس',   3.75, 'Starters', '',             'RoLL'),
    ('2', 'Fried Egg/بيض مقلي',  1.50, 'Breakfast', 'Egg Addition', ''),
    ('3', 'Mystery Dish/غامض',   2.00, 'Starters',  '',             'Ghost Group'),  # group not in the modifier sheets
    ('4', 'No Recipe Here/بلا',  1.00, 'Starters',  '',             'Mono'),         # no matching recipe
]


def _build_workbook(path):
    import openpyxl
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    def sheet(name, header, rows):
        ws = wb.create_sheet(name)
        ws.append([''])                       # r1 notes
        ws.append(['Dine'])                   # r2
        ws.append(header)                     # r3 header
        for row in rows:
            ws.append(list(row))

    sheet('POSLavu Forced Modifier',
          ['No.', 'Forced Modifier Item', 'Price', 'Forced Modifier List', 'Is This An Item Or A Note?'],
          FORCED_ROWS)
    sheet('POSLavu Optional Modifier',
          ['No.', 'Optional Modifier Item', 'Price', 'Optional Modifier List', 'Is This An Item Or A Note?'],
          OPTIONAL_ROWS)
    sheet('POSLavu Menu',
          ['No.', 'Dish Name', 'Price', 'Category', 'Optional Modifier', 'Forced Modifier'],
          MENU_ROWS)
    wb.save(path)


class POSImportTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._tmp = tempfile.TemporaryDirectory()
        cls.wb_path = str(Path(cls._tmp.name) / 'pos.xlsx')
        _build_workbook(cls.wb_path)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()
        super().tearDownClass()

    def setUp(self):
        self.branch = Branch.objects.create(name_en='Dine', code='DINE', sort_order=1)
        self.cat = MenuCategory.objects.create(name='Starters', sort_order=1)
        self.menu = Menu.objects.create(branch=self.branch, name='Dine Menu', is_active=True)
        # a dish matched by pos_item_name, and one by name_en
        self.arayes = DishRecipe.objects.create(
            name_en='Meat Arayes v2', recipe_code='ARY', branch='Dine', branch_ref=self.branch,
            category=self.cat, pos_item_name='Meat Arayes', selling_price=Decimal('3.75'))
        self.egg = DishRecipe.objects.create(
            name_en='Fried Egg', recipe_code='EGG', branch='Dine', branch_ref=self.branch,
            category=self.cat, selling_price=Decimal('1.50'))
        self.mystery = DishRecipe.objects.create(
            name_en='Mystery Dish', recipe_code='MYS', branch='Dine', branch_ref=self.branch,
            category=self.cat, selling_price=Decimal('2.00'))
        MenuLine.objects.create(menu=self.menu, dish=self.arayes, sort_order=1)
        MenuLine.objects.create(menu=self.menu, dish=self.egg, sort_order=2)

    def _run(self, *extra):
        call_command('import_pos_menu', self.wb_path, '--branch', 'Dine', *extra)

    # ── parsing ──────────────────────────────────────────────────────────
    def test_groups_and_options_created_markers_dropped(self):
        self._run()
        self.assertEqual(
            set(ModifierGroup.objects.values_list('name_en', flat=True)),
            {'RoLL', 'Mono', 'Big Set', 'Egg Addition', 'Ghost Group'},
        )
        roll = ModifierGroup.objects.get(name_en='RoLL')
        self.assertEqual(roll.options.count(), 3)                 # the "RoLL" marker row dropped
        chicken = roll.options.get(name_en='Chicken')
        self.assertEqual(chicken.name_ar, 'دجاج')                 # split on the last '/'
        self.assertEqual(chicken.price_delta, Decimal('5.450'))

    def test_kind_is_guessed(self):
        self._run()
        roll = ModifierGroup.objects.get(name_en='RoLL')
        self.assertEqual(roll.options.get(name_en='Chicken').kind, ModifierOptionKind.TYPE)     # 5.45 → variant
        self.assertEqual(roll.options.get(name_en='Garlic Sauce').kind, ModifierOptionKind.ADDON)   # 0.25 → add-on
        self.assertEqual(
            ModifierGroup.objects.get(name_en='Mono').options.get(name_en='Spicy').kind,
            ModifierOptionKind.CHOICE)                                                          # forced, free
        egg = ModifierGroup.objects.get(name_en='Egg Addition')
        self.assertEqual(egg.options.get(name_en='Mushroom').kind, ModifierOptionKind.ADDON)
        self.assertEqual(egg.options.get(name_en='Without Chicken').kind, ModifierOptionKind.INSTRUCTION)

    def test_selection_and_limits(self):
        self._run()
        self.assertEqual(ModifierGroup.objects.get(name_en='RoLL').selection, ModifierSelection.SINGLE)
        self.assertEqual(ModifierGroup.objects.get(name_en='RoLL').min_select, 1)
        egg = ModifierGroup.objects.get(name_en='Egg Addition')
        self.assertEqual(egg.selection, ModifierSelection.MULTI)
        self.assertEqual(egg.min_select, 0)
        big = ModifierGroup.objects.get(name_en='Big Set')
        self.assertEqual((big.selection, big.max_select), (ModifierSelection.MULTI, 6))

    # ── menu attach ──────────────────────────────────────────────────────
    def test_dish_and_menu_line_attach(self):
        self._run()
        roll = ModifierGroup.objects.get(name_en='RoLL')
        # matched by pos_item_name
        dmg = DishModifierGroup.objects.get(dish=self.arayes, group=roll)
        self.assertEqual(dmg.default_role, ModifierRole.FORCED)
        self.assertTrue(MenuLineModifier.objects.filter(
            menu_line__dish=self.arayes, group=roll, role=ModifierRole.FORCED).exists())
        # matched by name_en, optional role
        self.assertTrue(DishModifierGroup.objects.filter(
            dish=self.egg, group__name_en='Egg Addition', default_role=ModifierRole.OPTIONAL).exists())

    def test_undefined_group_is_created_and_attached(self):
        self._run()
        ghost = ModifierGroup.objects.get(name_en='Ghost Group')   # named on the menu, not in the modifier sheets
        self.assertEqual(ghost.options.count(), 0)
        self.assertTrue(DishModifierGroup.objects.filter(dish=self.mystery, group=ghost).exists())

    def test_unmatched_dish_is_skipped_not_created(self):
        self._run()
        self.assertFalse(DishRecipe.objects.filter(name_en__icontains='No Recipe Here').exists())
        self.assertFalse(DishModifierGroup.objects.filter(group__name_en='Mono').exists())

    # ── behaviour ────────────────────────────────────────────────────────
    def test_idempotent(self):
        self._run()
        self._run()
        self.assertEqual(ModifierGroup.objects.filter(name_en='RoLL').count(), 1)
        self.assertEqual(ModifierGroup.objects.get(name_en='RoLL').options.count(), 3)
        self.assertEqual(DishModifierGroup.objects.filter(dish=self.arayes).count(), 1)

    def test_dry_run_saves_nothing(self):
        self._run('--dry-run')
        self.assertEqual(ModifierGroup.objects.count(), 0)
        self.assertEqual(DishModifierGroup.objects.count(), 0)
