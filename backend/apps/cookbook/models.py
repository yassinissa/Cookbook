"""
NOTE — Cookbook recipe content
Modeled directly on the two real sources this system replaces:
  - inventory-platform's apps.recipes (ProductionRecipe/DishRecipe) — the
    shapes ProductionRecipe/DishRecipe below mirror exactly, since a
    finished recipe here gets pushed to those exact endpoints via
    apps.integrations.inventory_client.
  - the "200 Lebanese Menu Cook Book.xlsm" recipe-card format — a Recipe
    sheet with one printable card per dish (ingredients w/ qty+prep note,
    numbered steps, costing, taste profile, chef/QA approval, revision
    history) plus a separate Dish Standards Database sheet (QA/QC sensory
    targets). Field names below come directly from that card.

Ingredients reference inventory-platform items by SKU (item_sku), not a
local FK — Item itself is never duplicated here, only read live via
apps.integrations.inventory_client. item_name_snapshot is NOT the item's
own name; it's the recipe-specific display name from the card (e.g. the
item "Parsley" appears in a recipe as "Parsley Chopped").

Versioning follows inventory-platform's convention (version + is_current)
rather than the spreadsheet's manual "copy old revision to a History
sheet" process — editing creates a new version, old ones are kept for
cost-history, matching apps.recipes.ProductionRecipe/DishRecipe.
"""
from django.db import models
from apps.core.models import BaseModel


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
    unit               = models.CharField(max_length=20,
                           help_text="Unit code as used in this recipe, e.g. 'g', 'ml', 'pcs', 'pinch'.")

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


class RecipeCardFields(models.Model):
    """Fields shared by both recipe types — costing/approval/versioning."""
    name_en              = models.CharField(max_length=255)
    name_ar              = models.CharField(max_length=255, blank=True)
    version              = models.PositiveIntegerField(default=1)
    is_current           = models.BooleanField(default=True)

    prep_time_minutes    = models.PositiveIntegerField(null=True, blank=True)
    expected_waste_pct   = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    include_labor_cost   = models.BooleanField(default=True)
    labor_cost           = models.DecimalField(max_digits=12, decimal_places=3, default=0,
                             help_text='Labor cost per serving/batch (KWD).')
    # Ingredient cost is computed live from inventory-platform unit costs
    # (apps.integrations.inventory_client), not stored — it would go stale
    # the moment a supplier price changes. cost is the last computed total,
    # refreshed via a recalculate action, same convention as
    # apps.recipes.DishRecipe.cost on the inventory-platform side.
    cost                 = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    approved_by          = models.CharField(max_length=255, blank=True, help_text='Executive chef name.')
    qa_approved_by        = models.CharField(max_length=255, blank=True)
    approved_at          = models.DateField(null=True, blank=True)

    notes                = models.TextField(blank=True)

    class Meta:
        abstract = True


# ── Production recipes (prep kitchen) ───────────────────────────────────────

class ProductionRecipe(RecipeCardFields):
    """Prep-kitchen recipe: raw materials -> one prepared product.
    Pushed to inventory-platform's POST /api/recipes/production/."""
    output_item_sku = models.CharField(max_length=100,
                        help_text='SKU of the prepared-product Item this recipe produces.')
    output_qty      = models.DecimalField(max_digits=12, decimal_places=3,
                        help_text='How much output one batch of this recipe yields.')
    output_unit     = models.CharField(max_length=20)
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
    category        = models.CharField(max_length=100, blank=True,
                        help_text='Menu section, e.g. "Salad", "Grill", "Cold Mizze" — not an item category.')
    branch          = models.CharField(max_length=100, blank=True,
                        help_text='Branch this dish belongs to, e.g. "Dine", "Luma", "Levant".')
    selling_price   = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    rating          = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True,
                        help_text='0-10 customer/QA rating.')
    taste_profile   = models.CharField(max_length=255, blank=True,
                        help_text='Short free-text summary, e.g. "Fresh, Tangy, Sour, Light."')

    def __str__(self):
        return f'{self.name_en} v{self.version}'


class DishRecipeIngredient(IngredientLine):
    recipe = models.ForeignKey(DishRecipe, on_delete=models.CASCADE, related_name='ingredients')


class DishRecipeStep(RecipeStepLine):
    recipe = models.ForeignKey(DishRecipe, on_delete=models.CASCADE, related_name='steps')


# ── QA/QC sensory standards ──────────────────────────────────────────────────

class DishStandard(BaseModel):
    """
    Sensory + physical QA/QC targets for one dish — a separate, deeper
    layer on top of the recipe itself (from the "Dish Standards Database"
    sheet). Not every dish has one yet.
    """
    dish_recipe            = models.OneToOneField(DishRecipe, on_delete=models.CASCADE, related_name='standard')

    service_style          = models.CharField(max_length=100, blank=True)
    portion_weight_g       = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    portion_tolerance_g    = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    serving_temp_c         = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    temp_tolerance_c       = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    holding_time_minutes   = models.PositiveIntegerField(null=True, blank=True)

    appearance             = models.TextField(blank=True)
    color                  = models.TextField(blank=True)
    aroma                  = models.TextField(blank=True)
    texture                = models.TextField(blank=True)
    presentation           = models.TextField(blank=True)

    # 0-10 intensity scale + approved +/- tolerance, per the sheet's legend
    sweetness_target       = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    sweetness_tolerance    = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    saltiness_target       = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    saltiness_tolerance    = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    sourness_target        = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    sourness_tolerance     = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    bitterness_target      = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    bitterness_tolerance   = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    umami_target           = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    umami_tolerance        = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    spice_target           = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    spice_tolerance        = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    richness_target        = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    richness_tolerance     = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    smokiness_target       = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    smokiness_tolerance    = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    primary_flavor         = models.CharField(max_length=255, blank=True)
    secondary_flavor       = models.CharField(max_length=255, blank=True)
    aftertaste             = models.CharField(max_length=255, blank=True)
    mouthfeel              = models.CharField(max_length=255, blank=True)
    freshness_standard     = models.TextField(blank=True)
    critical_defects_not_allowed = models.TextField(blank=True)

    qa_approved_by         = models.CharField(max_length=255, blank=True)
    approval_date          = models.DateField(null=True, blank=True)

    def __str__(self):
        return f'Standard for {self.dish_recipe.name_en}'
