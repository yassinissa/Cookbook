"""Create / update / prune Capability rows to match capabilities.CAPABILITIES."""
from django.core.management.base import BaseCommand

from apps.accounts.capabilities import CAPABILITIES, CAPABILITY_CODES
from apps.accounts.models import Capability


class Command(BaseCommand):
    help = 'Sync the Capability table with apps.accounts.capabilities.CAPABILITIES'

    def add_arguments(self, parser):
        parser.add_argument('--prune', action='store_true',
                            help='Delete Capability rows no longer in the catalogue.')

    def handle(self, *args, **options):
        created = updated = 0
        for code, label, group in CAPABILITIES:
            obj, was_created = Capability.objects.update_or_create(
                code=code, defaults={'label': label, 'group': group})
            created += was_created
            updated += (not was_created)

        pruned = 0
        if options['prune']:
            stale = Capability.objects.exclude(code__in=CAPABILITY_CODES)
            pruned = stale.count()
            stale.delete()

        self.stdout.write(self.style.SUCCESS(
            f'capabilities: {created} created, {updated} updated'
            + (f', {pruned} pruned' if options['prune'] else '')))
