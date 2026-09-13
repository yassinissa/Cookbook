"""Add the Branch Staff / Branch Manager / Prep Kitchen Staff / Prep Kitchen
Manager roles — scoped view-only vs full-CRUD-incl-delete pairs for the new
per-brand and per-prep-kitchen staff/manager split (the Kitchen screen).

Uses update_or_create (like 0002) rather than get-or-skip (like 0003/0004/0005)
because this migration needs to *create* new Role rows, not just re-sync
capabilities on roles that already exist.
"""
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
        role, _ = Role.objects.update_or_create(
            name=spec['name'],
            defaults={
                'description': spec['description'],
                'grants_all_branches': spec['grants_all_branches'],
                'grants_all_prep_kitchens': spec['grants_all_prep_kitchens'],
                'is_system': True,
            },
        )
        codes = CAPABILITY_CODES if spec['capabilities'] == '*' else spec['capabilities']
        role.capabilities.set([caps[c] for c in codes])


def unseed(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Role.objects.filter(
        name__in=['Branch Staff', 'Branch Manager', 'Prep Kitchen Staff', 'Prep Kitchen Manager'],
        is_system=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_admin_branches_capability'),
    ]

    operations = [
        migrations.RunPython(sync, unseed),
    ]
