"""
NOTE — Item supplements (per-SKU, Cookbook-local, NOT pushed to inventory-platform)

From "Items Data Log" and "Store Items" sheets. The Items Data Log sheet's
own header explains the design directly: "Use this table to enter missing
or more data required for any items in the store list... Only Temporarily
in this Cook Book Only. For changing the main data in the store, please
report to store." So this data is deliberately NOT the same thing as
inventory-platform's Item — it's a Cookbook-side supplement, keyed by
item_sku (same pattern as RecipeIngredient), that a human later reports
upstream if it should become permanent.

Two distinct concerns kept apart, per instruction not to merge:
  - ItemConversion(Line): COOKING-MEASURE conversions (1 Tbs of this
    ingredient = how many g/ml) — density-dependent, why this can't be a
    single global table (see StandardMeasurementConversion in
    reference.py, which IS global/fixed and stays separate from this).
  - ItemConversion's packaging fields (grams_per_piece, pieces_per_pack,
    pieces_per_kg, pieces_or_pack_per_box): PACKAGE/PIECE counts — a
    different question ("how many pieces in a box") than a cooking
    measure, kept as distinct fields rather than folded into the
    cooking-measure lines.
  - ItemNutrition: nutrition facts — a third, unrelated concern.
"""
from django.db import models
from apps.core.models import BaseModel
from .reference import UnitScale, Approver


class ItemConversion(BaseModel):
    """Per-SKU cooking-measure + packaging conversions."""
    item_sku      = models.CharField(max_length=100, unique=True,
                      help_text='SKU of the inventory-platform Item this supplements.')
    note_to_add   = models.TextField(blank=True)

    # Packaging/piece conversions — distinct from the cooking-measure
    # lines below (see module docstring).
    grams_per_piece         = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    pieces_per_pack         = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    pieces_per_kg           = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    pieces_or_pack_per_box  = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)

    updated_by    = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    approved_by   = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    def __str__(self):
        return f'Conversions for {self.item_sku}'


class ItemConversionLine(BaseModel):
    """
    One cooking-measure conversion row, e.g. '1 Tbs = 25.00 g'.
    gram_equivalent is only set for ml-based (liquid) ingredients that
    also need a secondary weight conversion (matches the sheet's separate
    '... into Gram' columns, present only for Tbs/Ts/half-Ts).
    """
    item_conversion  = models.ForeignKey(ItemConversion, on_delete=models.CASCADE, related_name='lines')
    label            = models.CharField(max_length=20,
                         help_text='e.g. "1 Tbs", "1/2 Ts", "1/8 Cup".')
    quantity         = models.DecimalField(max_digits=12, decimal_places=3)
    unit             = models.ForeignKey(UnitScale, on_delete=models.PROTECT, related_name='+')
    gram_equivalent  = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True,
                         help_text='Secondary gram conversion, only used for ml-based ingredients.')

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.label} = {self.quantity} {self.unit.code}'


class ItemNutrition(BaseModel):
    """Per-SKU nutrition facts, per unit (g/ml/each — see unit_scale)."""
    item_sku          = models.CharField(max_length=100, unique=True)
    unit_scale        = models.ForeignKey(UnitScale, on_delete=models.PROTECT, related_name='+',
                          help_text='The unit these values are per, e.g. per gram, per ml, per each.')

    calories          = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    fat_g             = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    protein_g         = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    saturated_fat_g   = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    trans_fat_g       = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    cholesterol_mg    = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    sodium_mg         = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    carbs_g           = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    fibers_g          = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    sugars_g          = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    added_sugars_g    = models.DecimalField(max_digits=10, decimal_places=3, default=0)

    verification_notes = models.CharField(max_length=255, blank=True,
                           help_text='e.g. "OK", "Check Required - All values zero", "OK - Non-Food".')

    updated_by        = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    approved_by       = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    def __str__(self):
        return f'Nutrition for {self.item_sku}'
