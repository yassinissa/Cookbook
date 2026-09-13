"""Give every role with dish.edit or production.edit costing.view (+
costing.recalculate) — Restaurant Cook, Prep Cook, Branch Manager, Prep
Kitchen Manager.

Without it, HidesCostingFields (apps/cookbook/serializers/mixins.py) nulls
out selling_price/cost in every response these roles see — including the
dish/production edit form, which initializes its price field from that
now-null value and sends `null` back on save. A cook or manager saving an
edit for any reason (fixing a typo, changing a step) silently wiped the
dish's real price. Also explains why "Food cost" / "Price" columns showed
empty on the admin list for these roles — the fields were never emptied in
the database, they were being stripped in the API response.

Branch Staff / Prep Kitchen Staff are deliberately left without it — they
have no edit capability, and "no prices, just the recipe" is the whole
point of the staff Kitchen screen.
"""
from django.db import migrations

from apps.accounts.capabilities import CAPABILITY_CODES, SYSTEM_ROLES


def sync(apps, schema_editor):
    Capability = apps.get_model('accounts', 'Capability')
    Role = apps.get_model('accounts', 'Role')

    caps = {c.code: c for c in Capability.objects.all()}

    for spec in SYSTEM_ROLES:
        try:
            role = Role.objects.get(name=spec['name'], is_system=True)
        except Role.DoesNotExist:
            continue
        codes = CAPABILITY_CODES if spec['capabilities'] == '*' else spec['capabilities']
        role.capabilities.set([caps[c] for c in codes])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_kitchen_and_branch_manager_roles'),
    ]

    operations = [
        migrations.RunPython(sync, noop),
    ]
