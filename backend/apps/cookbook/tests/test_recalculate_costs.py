"""
`manage.py recalculate_costs` — bulk re-cost of current recipes.

Pins: dry run saves nothing; --commit saves only recipes whose numbers moved
and writes a history row + "Cost recalculated" entry for each; archived
versions are left alone; an unreachable inventory-platform aborts the run
instead of wiping prices.
"""
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.cookbook.models import (
    ActivityActionType, DishPriceHistory, DishRecipe, DishRecipeActivityLog,
    DishRecipeIngredient, ItemConversion,
)
from apps.integrations.inventory_client import InventoryAPIError
from .support import fake_inventory_items, item, make_units


class RecalculateCostsTests(TestCase):
    def setUp(self):
        self.units = make_units()
        # priced per packet in inventory; Cookbook knows 1 PKT = 1000 g
        ItemConversion.objects.create(item_sku='P1', base_unit=self.units['g'],
                                      order_unit='PKT', pack_qty=Decimal('1000'))
        self.dish = self._dish('Fries', current=True)
        self.old = self._dish('Fries v1', current=False)

    def _dish(self, name, current):
        d = DishRecipe.objects.create(name_en=name, recipe_code=name, is_current=current,
                                      cost=Decimal('0'), cost_breakdown={'issues': [{'sku': 'P1'}]})
        DishRecipeIngredient.objects.create(recipe=d, item_sku='P1', item_name_snapshot='Fries',
                                            quantity=Decimal('250'), unit=self.units['g'])
        return d

    def run_cmd(self, *args, price='2.000'):
        out = StringIO()
        with fake_inventory_items([item('P1', unit_cost=price, unit_code='packet')]):
            call_command('recalculate_costs', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_saves_nothing(self):
        out = self.run_cmd()
        self.assertIn('DRY RUN', out)
        self.assertIn('1 changed', out)
        self.dish.refresh_from_db()
        self.assertEqual(self.dish.cost, Decimal('0'))
        self.assertFalse(DishPriceHistory.objects.exists())

    def test_commit_recosts_current_recipes_and_logs(self):
        self.run_cmd('--commit')
        self.dish.refresh_from_db()
        self.assertEqual(self.dish.cost, Decimal('0.500'))        # 250 g x 2.000 / 1000 g
        self.assertEqual(self.dish.cost_breakdown['issues'], [])
        self.assertEqual(DishPriceHistory.objects.filter(dish_recipe=self.dish).count(), 1)
        self.assertTrue(DishRecipeActivityLog.objects.filter(
            recipe=self.dish, action_type=ActivityActionType.RECALCULATED, changed_by='system').exists())
        self.old.refresh_from_db()
        self.assertEqual(self.old.cost, Decimal('0'))             # archived version untouched

    def test_unchanged_recipe_is_not_resaved(self):
        self.run_cmd('--commit')
        out = self.run_cmd('--commit')
        self.assertIn('0 changed', out)
        self.assertEqual(DishPriceHistory.objects.count(), 1)

    def test_price_change_flows_through(self):
        self.run_cmd('--commit')
        self.run_cmd('--commit', price='4.000')
        self.dish.refresh_from_db()
        self.assertEqual(self.dish.cost, Decimal('1.000'))

    def test_inventory_down_aborts(self):
        with mock.patch('apps.integrations.inventory_client.InventoryClient.get_items',
                        side_effect=InventoryAPIError('down')):
            with self.assertRaises(CommandError):
                call_command('recalculate_costs', '--commit', stdout=StringIO())
        self.dish.refresh_from_db()
        self.assertEqual(self.dish.cost_breakdown['issues'], [{'sku': 'P1'}])

    def test_received_price_replaces_the_imported_sheet_cost(self):
        # the sheet once said 1.000 per 1000 g; inventory's receiving average is 2.000 per packet
        ItemConversion.objects.filter(item_sku='P1').update(order_cost=Decimal('1.000'))
        self.run_cmd('--commit')
        self.dish.refresh_from_db()
        self.assertEqual(self.dish.cost, Decimal('0.500'))        # 250 g x 2.000 / 1000 g, not 0.250
        # never received in inventory -> the sheet cost is the fallback
        self.run_cmd('--commit', price='0')
        self.dish.refresh_from_db()
        self.assertEqual(self.dish.cost, Decimal('0.250'))


class HourlyCronAuditTests(TestCase):
    """--quiet-if-unchanged: the hourly cron leaves no system-log row when it
    changed nothing; a run that re-costs something, or fails, is still logged."""

    setUp, _dish, run_cmd = RecalculateCostsTests.setUp, RecalculateCostsTests._dish, RecalculateCostsTests.run_cmd

    def _command_rows(self):
        from apps.cookbook.models import SystemActivityLog
        return SystemActivityLog.objects.filter(subject_type='command', subject_code='recalculate_costs')

    def test_quiet_run(self):
        self.run_cmd('--commit', '--quiet-if-unchanged')           # re-costs Fries -> logged
        self.assertEqual(self._command_rows().count(), 1)
        self.run_cmd('--commit', '--quiet-if-unchanged')           # nothing moved -> silent
        self.assertEqual(self._command_rows().count(), 1)
        self.run_cmd('--commit')                                   # manual runs always log
        self.assertEqual(self._command_rows().count(), 2)

    def test_failed_quiet_run_is_logged(self):
        with mock.patch('apps.integrations.inventory_client.InventoryClient.get_items',
                        side_effect=InventoryAPIError('down')):
            with self.assertRaises(CommandError):
                call_command('recalculate_costs', '--commit', '--quiet-if-unchanged', stdout=StringIO())
        self.assertEqual(self._command_rows().count(), 1)
