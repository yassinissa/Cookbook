"""
NOTE — Recipe authoring
Modeled directly on the two real sources this system replaces:
  - inventory-platform's apps.recipes (ProductionRecipe/DishRecipe) — the
    shapes below mirror that exactly, since a finished recipe here gets
    pushed to those exact endpoints via apps.integrations.inventory_client.
  - "200 Lebanese Menu Cook Book.xlsm"'s Recipe sheet — one printable card
    per dish (ingredients w/ qty+prep note, numbered steps, costing, taste
    profile, chef/QA approval, revision history).

Ingredients reference inventory-platform items by SKU (item_sku), not a
local FK — Item itself is never duplicated here, only read live via
apps.integrations.inventory_client. item_name_snapshot is NOT the item's
own name; it's the recipe-specific display name from the card (e.g. the
item "Spring Onion" appears in a recipe as "Spring Onion Chopped").

Versioning follows inventory-platform's convention (version + is_current)
rather than the spreadsheet's manual "copy old revision to a History
sheet" process — editing creates a new version, old ones are kept for
cost-history, matching apps.recipes.ProductionRecipe/DishRecipe.
"""
from django.db import models
from apps.core.models import BaseModel
from .reference import Section, Approver, UnitScale, MenuCategory, Allergen, ServiceStyle, Branch


# ── Shared abstract pieces ──────────────────────────────────────────────────

class IngredientLine(BaseModel):
    """One ingredient row on a recipe card, e.g. '75 g Parsley Chopped'."""
    order              = models.PositiveIntegerField(default=0)
    item_sku           = models.CharField(max_length=100,
                           help_text='SKU of the inventory-platform Item this line uses.')
    item_name_snapshot = models.CharField(max_length=255,
                           help_text="Display name as used in this recipe (may differ from the item's own "
                                     "name_en, e.g. item 'Spring Onion' used here as 'Spring Onion Chopped').")
    prep_note          = models.CharField(max_length=255, blank=True,
                           help_text="How it's prepped for this recipe, e.g. 'Chopped', '(Zest)', 'Small Diced'.")
    quantity           = models.DecimalField(max_digits=12, decimal_places=3)
    unit               = models.ForeignKey(UnitScale, on_delete=models.PROTECT, related_name='+')

    class Meta:
        abstract = True
        ordering = ['order']


class RecipeStepLine(BaseModel):
    """One numbered cooking step."""
    step_number = models.PositiveIntegerField()
    instruction = models.TextField()

    class Meta:
        abstract = True
        ordering = ['step_number']


class RecipeCardFields(BaseModel):
    """Fields shared by both recipe types — costing/approval/versioning."""
    name_en              = models.CharField(max_length=255)
    name_ar              = models.CharField(max_length=255, blank=True)
    recipe_code          = models.CharField(max_length=30, blank=True, db_index=True,
                             help_text='The source cook book\'s dish code, e.g. "1076.9". '
                                       'Stable across versions; the import matches on it.')
    version              = models.PositiveIntegerField(default=1)
    is_current           = models.BooleanField(default=True)
    revision             = models.CharField(max_length=20, blank=True,
                             help_text='Revision label from the sheet, e.g. "Rev.01" or "Fix".')
    revision_date        = models.DateField(null=True, blank=True)

    section              = models.ForeignKey(Section, on_delete=models.PROTECT, null=True, blank=True,
                             related_name='+', help_text='Kitchen station that preps this recipe.')

    prep_time_minutes    = models.PositiveIntegerField(null=True, blank=True)
    # a percentage number: 1.00 == 1 %  (waste cost = items cost * this / 100)
    expected_waste_pct   = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    include_labor_cost   = models.BooleanField(default=True)
    labor_cost           = models.DecimalField(max_digits=12, decimal_places=3, default=0,
                             help_text='Labour cost per serving/batch (KWD). Recomputed on save '
                                       'from section salary x prep time.')
    # Ingredient cost is computed from Cookbook's ItemConversion data (imported
    # from the store-items sheet), with inventory unit_cost as a fallback. Not
    # stored per-item — a supplier price change would make it stale. `cost` is
    # the last computed cost per serving (items + waste + labour), refreshed on
    # save and via the recalculate action.
    cost                 = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    # Full breakdown from the last compute — items/waste/labour split, per
    # ingredient line cost + status, price scenarios. Read by the recipe card
    # without a recompute; refreshed on save and recalculate.
    cost_breakdown       = models.JSONField(default=dict, blank=True)

    approved_by          = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True,
                             related_name='+', help_text='Executive chef who approved this recipe.')
    qa_approved_by       = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True,
                             related_name='+')
    approved_at          = models.DateField(null=True, blank=True)

    notes                = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        abstract = True


# ── Production recipes (prep kitchen) ───────────────────────────────────────

class ProductionRecipe(RecipeCardFields):
    """Prep-kitchen recipe: raw materials -> one prepared product.
    Pushed to inventory-platform's POST /api/recipes/production/."""
    output_item_sku = models.CharField(max_length=100,
                        help_text='SKU of the prepared-product Item this recipe produces.')
    output_qty      = models.DecimalField(max_digits=12, decimal_places=3,
                        help_text='How much output one batch of this recipe yields.')
    output_unit     = models.ForeignKey(UnitScale, on_delete=models.PROTECT, related_name='+')
    prep_kitchen    = models.CharField(max_length=255, blank=True,
                        help_text='Which prep kitchen this recipe belongs to (e.g. "Bread & Sauces").')

    def __str__(self):
        return f'{self.name_en} v{self.version}'


class ProductionRecipeIngredient(IngredientLine):
    recipe = models.ForeignKey(ProductionRecipe, on_delete=models.CASCADE, related_name='ingredients')


class ProductionRecipeStep(RecipeStepLine):
    recipe = models.ForeignKey(ProductionRecipe, on_delete=models.CASCADE, related_name='steps')


# ── Dish recipes (restaurant / branch menu) ─────────────────────────────────

class DishRecipe(RecipeCardFields):
    """Branch dish recipe: prepared/raw items -> one menu dish.
    Pushed to inventory-platform's POST /api/recipes/dish/."""
    pos_item_name   = models.CharField(max_length=255, blank=True,
                        help_text='Exact name in the POS system, for matching sales imports.')
    category        = models.ForeignKey(MenuCategory, on_delete=models.PROTECT, null=True, blank=True,
                        related_name='dishes',
                        help_text='Menu section shown to customers — not the same as `section` (kitchen station).')
    service_style   = models.ForeignKey(ServiceStyle, on_delete=models.PROTECT, null=True, blank=True,
                        related_name='+')
    allergens       = models.ManyToManyField(Allergen, blank=True, related_name='dishes')
    branch          = models.CharField(max_length=100, blank=True,
                        help_text='Branch this dish belongs to, e.g. "Dine", "Luma", "Levant". '
                                   'Free text for now; branch_ref is the structured version.')
    branch_ref      = models.ForeignKey(Branch, on_delete=models.PROTECT, null=True, blank=True,
                        related_name='dishes',
                        help_text='Structured branch. Takes over from the `branch` string in a later phase.')
    selling_price   = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    rating          = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True,
                        help_text='0-10 customer/QA rating.')
    rating_status   = models.CharField(max_length=10, blank=True,
                        choices=[('ok', 'OK'), ('attention', 'Attention'), ('fix', 'Fix')],
                        help_text='QA alarm shown next to the rating on the menu view.')
    rating_date     = models.DateField(null=True, blank=True)
    taste_profile   = models.CharField(max_length=255, blank=True,
                        help_text='Short free-text summary, e.g. "Fresh, Tangy, Sour, Light."')

    def __str__(self):
        return f'{self.name_en} v{self.version}'


class DishRecipeIngredient(IngredientLine):
    recipe = models.ForeignKey(DishRecipe, on_delete=models.CASCADE, related_name='ingredients')


class DishRecipeStep(RecipeStepLine):
    recipe = models.ForeignKey(DishRecipe, on_delete=models.CASCADE, related_name='steps')
