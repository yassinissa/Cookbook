from decimal import Decimal

from django.test import TestCase

from apps.cookbook.models import (
    Allergen, DishRecipe, DishRecipeIngredient, ItemNutrition,
)
from apps.cookbook.costing import CostContext
from apps.cookbook.nutrition import allergen_rollup, roll_up_nutrition
from .support import make_tabbouleh_items, make_units


class NutritionRollupTests(TestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        # per-gram nutrition for two of the Tabbouleh SKUs
        ItemNutrition.objects.create(item_sku='B2018', unit_scale=self.units['g'],
                                     calories=Decimal('0.36'), protein_g=Decimal('0.03'), sodium_mg=Decimal('0.56'))
        ItemNutrition.objects.create(item_sku='B72', unit_scale=self.units['g'],
                                     calories=Decimal('0.18'), carbs_g=Decimal('0.039'))

    def test_scales_by_quantity_and_reports_coverage(self):
        lines = [
            {'item_sku': 'B2018', 'quantity': '75', 'unit': 'g'},
            {'item_sku': 'B72', 'quantity': '190', 'unit': 'g'},
            {'item_sku': 'B420', 'quantity': '10', 'unit': 'g'},   # no ItemNutrition
        ]
        ctx = CostContext([l['item_sku'] for l in lines], {})
        out = roll_up_nutrition(lines, ctx)
        self.assertAlmostEqual(float(out['calories']), 75 * 0.36 + 190 * 0.18, places=3)
        self.assertAlmostEqual(float(out['protein_g']), 75 * 0.03, places=3)
        self.assertEqual(out['_coverage'], {'covered': 2, 'total': 3})

    def test_piece_ingredient_converts_via_grams_per_piece(self):
        ItemNutrition.objects.create(item_sku='B271', unit_scale=self.units['g'], calories=Decimal('0.3'))
        lines = [{'item_sku': 'B271', 'quantity': '1', 'unit': 'Pc'}]   # 1 Pc = 117 g
        ctx = CostContext(['B271'], {})
        out = roll_up_nutrition(lines, ctx)
        self.assertAlmostEqual(float(out['calories']), 117 * 0.3, places=3)


class AllergenRollupTests(TestCase):
    def setUp(self):
        self.units = make_units()
        make_tabbouleh_items(self.units)
        self.gluten = Allergen.objects.create(name='Gluten')
        self.sesame = Allergen.objects.create(name='Sesame')

    def _recipe(self):
        r = DishRecipe.objects.create(name_en='X')
        for sku in ('B470', 'B2018'):
            DishRecipeIngredient.objects.create(recipe=r, item_sku=sku, quantity=1, unit=self.units['g'],
                                                item_name_snapshot=sku)
        return r

    def test_union_of_dish_and_ingredient_allergens(self):
        from apps.cookbook.models import ItemConversion
        ItemConversion.objects.get(item_sku='B470').allergens.add(self.gluten)
        r = self._recipe()
        r.allergens.add(self.sesame)

        roll = allergen_rollup(r)
        self.assertEqual(roll['dish'], ['Sesame'])
        self.assertEqual(roll['from_ingredients'], [{'sku': 'B470', 'name': 'B470', 'allergens': ['Gluten']}])
        self.assertEqual(roll['all'], ['Gluten', 'Sesame'])
