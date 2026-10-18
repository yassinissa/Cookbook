"""
Rewrite each stored cost_breakdown line's `quantity` in the one spelling
costing.serialize_cost_result now writes ("2", not "2" from a form save and
"2.000" from a recalculation). Costs are untouched. Without it the first
hourly `recalculate_costs` run would see nearly every recipe as "changed"
and log a no-op recalculation + price-history row for each.
"""
from decimal import Decimal, InvalidOperation

from django.db import migrations


def _canon(q):
    try:
        return format(Decimal(str(q)).normalize(), 'f')
    except (InvalidOperation, ValueError):
        return q


def forwards(apps, schema_editor):
    for name in ('DishRecipe', 'ProductionRecipe'):
        model = apps.get_model('cookbook', name)
        dirty = []
        for r in model.objects.exclude(cost_breakdown={}).only('id', 'cost_breakdown').iterator():
            lines = (r.cost_breakdown or {}).get('lines') or []
            changed = False
            for line in lines:
                q = line.get('quantity')
                if q is not None and _canon(q) != q:
                    line['quantity'] = _canon(q)
                    changed = True
            if changed:
                dirty.append(r)
        model.objects.bulk_update(dirty, ['cost_breakdown'], batch_size=200)


class Migration(migrations.Migration):
    dependencies = [('cookbook', '0034_sando_categories_sections')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
