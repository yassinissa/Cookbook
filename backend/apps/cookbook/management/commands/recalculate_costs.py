"""
Recompute the stored cost of every current dish + production recipe from
today's item prices and conversions — what the per-recipe Recalculate button
does, for all of them at once.

Dry-run by default; pass --commit to save.

    python manage.py recalculate_costs
    python manage.py recalculate_costs --commit
    python manage.py recalculate_costs --kind dish --commit

A recipe's `cost` / `cost_breakdown` is a snapshot from its last save, so an
inventory price change (or a conversion fix) doesn't reach it until it is
recalculated. Only recipes whose numbers actually changed are saved, and each
of those gets the same history row + "Cost recalculated" activity entry the
button writes. Inventory prices are pulled once for the whole run; if
inventory-platform can't be reached the run stops rather than re-costing
everything without its prices.
"""
from decimal import Decimal

from django.core.management.base import CommandError
from django.db import transaction

from apps.cookbook.audit import AuditedCommand
from apps.cookbook.models import (
    ActivityActionType, DishPriceHistory, DishRecipe, DishRecipeActivityLog,
    ProductionCostHistory, ProductionRecipe, ProductionRecipeActivityLog,
)
from apps.cookbook.services import apply_cost
from apps.integrations.inventory_client import InventoryAPIError, InventoryClient

ACTOR = 'system'


def _dish_history(r):
    DishPriceHistory.objects.create(dish_recipe=r, cost=r.cost, selling_price=r.selling_price)
    return DishRecipeActivityLog


def _production_history(r):
    ProductionCostHistory.objects.create(production_recipe=r, cost=r.cost, output_qty=r.output_qty)
    return ProductionRecipeActivityLog


KINDS = {
    'dish': (DishRecipe, _dish_history),
    'production': (ProductionRecipe, _production_history),
}


def _issue_count(r):
    return len((r.cost_breakdown or {}).get('issues', []))


class Command(AuditedCommand):
    help = 'Recompute the stored cost of every current recipe (dry run unless --commit).'

    def add_arguments(self, parser):
        parser.add_argument('--commit', action='store_true', help='Save the new costs (default: dry run).')
        parser.add_argument('--kind', choices=['all', *KINDS], default='all')

    def handle(self, *args, **opts):
        try:
            items = InventoryClient().get_items()
        except InventoryAPIError as e:
            raise CommandError(f'inventory-platform unreachable — nothing recalculated ({e})')
        inv = {i['sku']: i for i in items}
        if not inv:
            raise CommandError('inventory-platform returned no items — nothing recalculated')

        commit = opts['commit']
        kinds = list(KINDS) if opts['kind'] == 'all' else [opts['kind']]
        for kind in kinds:
            model, write_history = KINDS[kind]
            recipes = (model.objects.filter(is_current=True)
                       .select_related('section').prefetch_related('ingredients__unit')
                       .order_by('name_en'))
            seen = changed = 0
            issues_before = issues_after = 0
            for r in recipes:
                seen += 1
                old_cost, old_issues = Decimal(r.cost or 0), _issue_count(r)
                old = (r.cost_breakdown, r.nutrition, r.labor_cost)
                before = {'cost': r.cost, 'labor_cost': r.labor_cost}
                apply_cost(r, items_by_sku=inv)
                issues_before += old_issues
                issues_after += _issue_count(r)
                if (r.cost_breakdown, r.nutrition, r.labor_cost) == old and Decimal(r.cost) == old_cost:
                    continue
                changed += 1
                self.stdout.write(f'  {kind:10} {r.name_en[:40]:40} {old_cost:>9.3f} -> {Decimal(r.cost):>9.3f}'
                                  f'   issues {old_issues} -> {_issue_count(r)}')
                if commit:
                    with transaction.atomic():
                        r.save(update_fields=['cost', 'labor_cost', 'cost_breakdown', 'nutrition', 'updated_at'])
                        log = write_history(r)
                        # an adjustment, never a version — same shape as the button's entry
                        changes = {'fields': [
                            {'field': f, 'from': str(v), 'to': str(getattr(r, f))}
                            for f, v in before.items() if v != getattr(r, f)
                        ]}
                        log.objects.create(recipe=r, action_type=ActivityActionType.RECALCULATED,
                                           changed_by=ACTOR, description='Bulk cost recalculation',
                                           changes=changes, version=r.version)
            self.stdout.write(f'{kind}: {seen} current, {changed} changed, '
                              f'uncosted lines {issues_before} -> {issues_after}')

        if not commit:
            self.stdout.write(self.style.WARNING('DRY RUN — nothing saved. Re-run with --commit.'))
