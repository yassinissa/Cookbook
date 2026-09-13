"""
`manage.py backfill_wnr_modifiers` — the safe structural steps and idempotency.
Uses a tiny generated Lavu report so it doesn't depend on the repo-root xls.
"""
import io
import tempfile
from pathlib import Path

from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.cookbook.models import (
    Branch, DishRecipe, ModifierGroup, ModifierOption, DishModifierGroup, ModifierOptionKind,
)


def _report(lines):
    rows = ['Quantity\tItem\tMods\tID\tCategory\tItem Total\tModifiers\tTotal', *lines]
    f = tempfile.NamedTemporaryFile(mode='wb', suffix='.xls', delete=False)
    f.write('\n'.join(rows).encode('utf-16'))
    f.close()
    return f.name


class BackfillTests(APITestCase):
    def setUp(self):
        self.wnr = Branch.objects.create(name_en='WnR', sort_order=1)
        self.mongolian = DishRecipe.objects.create(name_en='Mongolian', recipe_code='M1',
                                                   branch_ref=self.wnr, pos_item_name='Mongolian')
        self.g = ModifierGroup.objects.create(name_en='WnR Protein Choice', selection='single', min_select=1)
        for n in ('Chicken', 'Beef'):
            ModifierOption.objects.create(group=self.g, name_en=n, kind='choice', pos_mods_string=n)
        DishModifierGroup.objects.create(dish=self.mongolian, group=self.g, default_role='forced')

        self.spicy = DishRecipe.objects.create(name_en='Spicy Potato', recipe_code='S1',
                                               branch_ref=self.wnr, pos_item_name='Spicy Potato')

    def _run(self):
        out = io.StringIO()
        path = _report([
            '9\tMongolian\tBeef\t1\tM\t0\t58\t58',
            '2\tMongolian\tANGUS Beef\t2\tM\t0\t17\t17',
            '5\tSpicy Potato\tBeef\t3\tM\t0\t32\t32',
        ])
        call_command('backfill_wnr_modifiers', '--commit', '--report', path, stdout=out)
        return out.getvalue()

    def test_choice_to_type_and_expand_and_attach(self):
        self._run()
        # A: existing options re-typed
        self.assertEqual(
            set(ModifierOption.objects.filter(group=self.g, kind='type').values_list('name_en', flat=True)),
            {'Chicken', 'Beef', 'ANGUS Beef'})
        # B: the uncovered report Mods "ANGUS Beef" was added
        angus = ModifierOption.objects.get(group=self.g, name_en='ANGUS Beef')
        self.assertEqual(angus.kind, ModifierOptionKind.TYPE)
        self.assertEqual(angus.pos_mods_string, 'ANGUS Beef')
        self.assertEqual(angus.deduction_status, 'needs_data')       # nothing deducts wrong
        # C: the bare WnR dish got the group attached
        self.assertTrue(DishModifierGroup.objects.filter(dish=self.spicy, group=self.g).exists())

    def test_idempotent(self):
        self._run()
        before = ModifierOption.objects.count()
        second = self._run()
        self.assertEqual(ModifierOption.objects.count(), before)
        self.assertIn('no structural changes needed', second)
