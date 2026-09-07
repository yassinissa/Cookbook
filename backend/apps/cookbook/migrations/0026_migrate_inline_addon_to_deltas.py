# Copy the deprecated inline add-on fields (ModifierOption.item_sku / quantity /
# unit) into ModifierOptionIngredient delta rows. The inline fields stay in the
# schema for one release; publishing + serializers read `deltas` only.

from django.db import migrations


def forwards(apps, schema_editor):
    ModifierOption = apps.get_model('cookbook', 'ModifierOption')
    ModifierOptionIngredient = apps.get_model('cookbook', 'ModifierOptionIngredient')
    for opt in ModifierOption.objects.exclude(item_sku='').exclude(item_sku=None):
        if opt.deltas.exists():
            continue
        ModifierOptionIngredient.objects.create(
            option=opt,
            item_sku=opt.item_sku,
            item_name_snapshot=opt.name_en or '',
            quantity=opt.quantity or 0,
            unit=opt.unit,
            direction='add',
            sort_order=0,
        )


def backwards(apps, schema_editor):
    # non-destructive: leave the delta rows, the inline fields still hold the value
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('cookbook', '0025_modifieroption_no_consumption_impact_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
