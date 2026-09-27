"""
Send every item's recipe conversions to inventory-platform in one go — the
same per-item table a recipe publish or a conversion edit sends
(apps.cookbook.publishing.sync_item_conversions), for every SKU Cookbook
holds conversion data for. Use it once after deploying, or after a bulk
import (import_store_items).

Dry run by default: it works everything out and lists items that can't be
converted yet. Pass --commit to send.

Usage:
    python manage.py sync_recipe_conversions
    python manage.py sync_recipe_conversions --commit
"""
from django.core.management.base import BaseCommand, CommandError

from apps.cookbook.publishing import sync_item_conversions
from apps.integrations.inventory_client import InventoryAPIError


class Command(BaseCommand):
    help = "Send Cookbook's per-item recipe conversions to inventory-platform."

    def add_arguments(self, parser):
        parser.add_argument('--commit', action='store_true', help='Actually send (default: dry run).')
        parser.add_argument('--sku', action='append', help='Only this SKU (repeatable).')

    def handle(self, *args, **opts):
        try:
            out = sync_item_conversions(opts['sku'], dry_run=not opts['commit'])
        except InventoryAPIError as e:
            raise CommandError(f'inventory-platform: {e}')

        for p in out['problems']:
            self.stdout.write(self.style.WARNING(f'  needs data  {p}'))
        for s in out['skipped']:
            self.stdout.write(self.style.WARNING(f'  skipped     {s}'))
        self.stdout.write(f"{out['rows']} conversion row(s) worked out; "
                          f"{len(out['problems'])} item(s) need their stock-unit size.")
        if opts['commit']:
            self.stdout.write(self.style.SUCCESS(f"Sent. {len(out['updated'])} item(s) changed on inventory-platform."))
        else:
            self.stdout.write(self.style.WARNING('DRY RUN: nothing sent. Re-run with --commit.'))
