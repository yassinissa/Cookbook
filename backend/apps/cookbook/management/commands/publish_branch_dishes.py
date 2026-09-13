"""
One-off: publish every unpublished, publish-ready DishRecipe for a given
branch to inventory-platform. Reuses the exact same
apps.cookbook.publishing.publish_dish_recipe used by the API's Publish
button — no shortcuts, so brand/SKU/unit resolution behaves identically.

Dry-run by default; pass --commit to actually push.

Usage:
    python manage.py publish_branch_dishes dine
    python manage.py publish_branch_dishes dine --commit
"""
from django.core.management.base import BaseCommand, CommandError

from apps.cookbook.models import Branch, DishRecipe
from apps.cookbook.publishing import publish_dish_recipe, RecipePublishError
from apps.integrations.inventory_client import InventoryClient, InventoryAPIError


class Command(BaseCommand):
    help = 'Publish every unpublished DishRecipe for a branch (by slug) to inventory-platform.'

    def add_arguments(self, parser):
        parser.add_argument('branch_slug')
        parser.add_argument('--commit', action='store_true', help='Actually publish (default: dry run).')

    def handle(self, *args, **opts):
        try:
            branch = Branch.objects.get(slug=opts['branch_slug'])
        except Branch.DoesNotExist:
            raise CommandError(f'No branch with slug "{opts["branch_slug"]}"')

        dishes = DishRecipe.objects.filter(branch_ref=branch, inventory_recipe_id='')
        self.stdout.write(f'{dishes.count()} unpublished dish(es) for {branch.name_en} ({branch.slug})')

        if not opts['commit']:
            self.stdout.write(self.style.WARNING('DRY RUN — nothing published. Re-run with --commit.'))
            for d in dishes:
                self.stdout.write(f'  would publish: {d.name_en}')
            return

        # One shared, already-authenticated client for the whole batch — each
        # publish_dish_recipe call would otherwise construct its own
        # InventoryClient and log in fresh, and enough of those in a tight
        # loop trips inventory-platform's own login rate limit.
        client = InventoryClient()

        ok, failed = [], []
        for d in dishes:
            try:
                result = publish_dish_recipe(d, client=client)
                warnings = result.get('warnings', [])
                ok.append((d.name_en, warnings))
                w = f' ({len(warnings)} warning(s))' if warnings else ''
                self.stdout.write(self.style.SUCCESS(f'  OK   {d.name_en}{w}'))
                for warn in warnings:
                    self.stdout.write(f'         ! {warn}')
            except (RecipePublishError, InventoryAPIError) as e:
                failed.append((d.name_en, str(e)))
                self.stdout.write(self.style.ERROR(f'  FAIL {d.name_en}: {e}'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Published {len(ok)} dish(es).'))
        if failed:
            self.stdout.write(self.style.ERROR(f'Failed {len(failed)} dish(es) — see FAIL lines above.'))
