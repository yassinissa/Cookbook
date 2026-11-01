"""
fix_sando_pos_data (dry run, expected-value guard, idempotent) and
publish_branch_dishes (current versions only, stale, exclude). Client is faked.
"""
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.cookbook.management.commands.fix_sando_pos_data import BUN_GROUP
from apps.cookbook.models import (
    Branch, DishModifierGroup, DishRecipe, ModifierGroup, ModifierOption,
    ModifierOptionIngredient, SystemActivityLog, UnitScale,
)


def _run(name, *args, **kw):
    out = StringIO()
    call_command(name, *args, stdout=out, **kw)
    return out.getvalue()


class FixSandoPosDataTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name_en='Sando', sort_order=1)
        ea = UnitScale.objects.create(code='EA', description='each', dimension='count', factor_to_canonical=1)
        self.drinks = DishRecipe.objects.create(
            name_en='Soft Drinks', recipe_code='SD', branch_ref=self.branch,
            pos_item_name='Soft Drinks/مشروبات غازيه')
        self.fried = DishRecipe.objects.create(name_en='Fried Chicken Bun', recipe_code='FC',
                                               branch_ref=self.branch)
        self.bun = ModifierGroup.objects.create(name_en=BUN_GROUP)
        self.sesame = ModifierOption.objects.create(group=self.bun, name_en='Sesame Bun', kind='addon',
                                                    pos_mods_string='Burger', price_delta=Decimal('1'))
        ModifierOptionIngredient.objects.create(option=self.sesame, item_sku='B1221', quantity=1, unit=ea,
                                                direction='remove')
        ModifierOptionIngredient.objects.create(option=self.sesame, item_sku='D122', quantity=1, unit=ea)
        addons = ModifierGroup.objects.create(name_en='Sando-Burger Add-Ons')
        self.ketchup = ModifierOption.objects.create(group=addons, name_en='Add Kitchup', kind='addon',
                                                     pos_mods_string='Moved On')
        arabic = ModifierGroup.objects.create(name_en='Sando-Pastrami Arabic-Options')
        pastrami = ModifierOption.objects.create(group=arabic, name_en='Pastrami (Arabic)', kind='addon',
                                                 pos_mods_string='Dairy Mayonnaise')
        self.mayo = ModifierOptionIngredient.objects.create(option=pastrami, item_sku='B291', quantity=3,
                                                            unit=ea, direction='remove')

    def test_dry_run_saves_nothing(self):
        out = _run('fix_sando_pos_data')
        self.assertIn('DRY RUN', out)
        self.drinks.refresh_from_db()
        self.assertEqual(self.drinks.pos_item_name, 'Soft Drinks/مشروبات غازيه')
        self.assertEqual(self.bun.options.count(), 1)
        self.assertFalse(DishModifierGroup.objects.exists())

    def test_commit_fixes_and_a_second_run_changes_nothing(self):
        _run('fix_sando_pos_data', '--commit')
        self.drinks.refresh_from_db()
        self.sesame.refresh_from_db()
        self.mayo.refresh_from_db()
        self.assertEqual(self.drinks.pos_item_name, '92.Soft Drinks/مشروبات غازيه')
        self.assertEqual(self.sesame.pos_mods_string, 'Sesame Bun')
        self.assertEqual((self.mayo.item_sku, self.mayo.item_name_snapshot, self.mayo.quantity),
                         ('B29', 'Mayonnaise C4', Decimal('3')))
        self.assertTrue(DishModifierGroup.objects.filter(dish=self.fried, group=self.bun).exists())
        seame = ModifierOption.objects.get(group=self.bun, name_en='Seame Bun')
        self.assertEqual(seame.pos_mods_string, 'Seame Bun')
        self.assertEqual({(d.item_sku, d.direction) for d in seame.deltas.all()},
                         {('B1221', 'remove'), ('D122', 'add')})
        self.assertTrue(SystemActivityLog.objects.filter(area='pos', subject_label='Soft Drinks').exists())

        before = SystemActivityLog.objects.filter(area='pos').count()
        self.assertIn('Changed 0,', _run('fix_sando_pos_data', '--commit'))
        self.assertEqual(SystemActivityLog.objects.filter(area='pos').count(), before)

    def test_a_row_the_team_changed_is_reported_not_overwritten(self):
        out = _run('fix_sando_pos_data', '--commit')
        self.ketchup.refresh_from_db()
        self.assertEqual(self.ketchup.pos_mods_string, 'Moved On')
        self.assertIn('expected "Add Kitchup", found "Moved On"', out)


class PublishBranchDishesTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name_en='Sando', sort_order=1)
        now = timezone.now()

        def dish(name, **kw):
            return DishRecipe.objects.create(name_en=name, recipe_code=name[:3], branch_ref=self.branch, **kw)

        self.new = dish('New')
        self.held = dish('Held')
        dish('Archived', is_current=False)
        self.clean = dish('Clean', inventory_recipe_id='1', published_at=now)
        self.edited = dish('Edited', inventory_recipe_id='2', published_at=now)
        DishRecipe.objects.filter(pk=self.clean.pk).update(updated_at=now + timedelta(milliseconds=300))
        DishRecipe.objects.filter(pk=self.edited.pk).update(updated_at=now + timedelta(minutes=5))

    def _published(self, *args):
        with mock.patch('apps.cookbook.management.commands.publish_branch_dishes.InventoryClient'), \
             mock.patch('apps.cookbook.management.commands.publish_branch_dishes.publish_dish_recipe',
                        return_value={'warnings': []}) as publish:
            _run('publish_branch_dishes', 'sando', '--commit', *args)
        return {c.args[0].name_en for c in publish.call_args_list}

    def test_never_an_archived_version(self):
        self.assertEqual(self._published(), {'New', 'Held'})

    def test_stale_and_exclude(self):
        self.assertEqual(self._published('--include-stale', '--exclude', 'held'), {'New', 'Edited'})

    def test_dry_run_publishes_nothing(self):
        with mock.patch('apps.cookbook.management.commands.publish_branch_dishes.publish_dish_recipe') as publish:
            out = _run('publish_branch_dishes', 'sando')
        publish.assert_not_called()
        self.assertIn('would publish: New', out)
