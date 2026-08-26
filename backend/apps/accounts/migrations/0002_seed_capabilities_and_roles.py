"""Populate the Capability catalogue, the built-in Roles, and give every
existing User a profile (superusers → Administrator)."""
from django.db import migrations

from apps.accounts.capabilities import CAPABILITIES, CAPABILITY_CODES, SYSTEM_ROLES


def seed(apps, schema_editor):
    Capability = apps.get_model('accounts', 'Capability')
    Role = apps.get_model('accounts', 'Role')
    UserProfile = apps.get_model('accounts', 'UserProfile')
    User = apps.get_model('auth', 'User')

    caps = {}
    for code, label, group in CAPABILITIES:
        obj, _ = Capability.objects.update_or_create(
            code=code, defaults={'label': label, 'group': group})
        caps[code] = obj

    admin_role = None
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
        if spec['name'] == 'Administrator':
            admin_role = role

    for user in User.objects.all():
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if user.is_superuser and profile.role_id is None:
            profile.role = admin_role
            profile.save(update_fields=['role'])


def unseed(apps, schema_editor):
    apps.get_model('accounts', 'Role').objects.filter(is_system=True).delete()
    apps.get_model('accounts', 'Capability').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('cookbook', '0012_prepkitchen_alter_productionrecipe_prep_kitchen_and_more'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
