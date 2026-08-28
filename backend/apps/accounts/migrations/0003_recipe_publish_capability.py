"""Re-sync the Capability catalogue and built-in role grants after adding
`recipe.publish` (given to Administrator via '*' and to Executive Chef)."""
from django.db import migrations

from apps.accounts.capabilities import CAPABILITIES, CAPABILITY_CODES, SYSTEM_ROLES


def sync(apps, schema_editor):
    Capability = apps.get_model('accounts', 'Capability')
    Role = apps.get_model('accounts', 'Role')

    caps = {}
    for code, label, group in CAPABILITIES:
        obj, _ = Capability.objects.update_or_create(
            code=code, defaults={'label': label, 'group': group})
        caps[code] = obj

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
        ('accounts', '0002_seed_capabilities_and_roles'),
    ]

    operations = [
        migrations.RunPython(sync, noop),
    ]
