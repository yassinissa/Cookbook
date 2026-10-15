"""
NOTE — Cost/price history + activity log
Replaces two manual spreadsheet processes:
  - "The Menu Copy" -> "Menu History" sheets: copy/paste dish cost+price
    snapshots by hand for trend tracking. Here, a row is written
    automatically every time a recipe's cost is (re)computed.
  - "Action Log" sheet: manually typed change log (date, action type,
    item, what changed, who changed it, who approved it). Here it's
    written automatically wherever a recipe is created/updated/recalculated.

Kept as four separate models (not one polymorphic table) — same
reasoning as everywhere else in this app: Dish and Production recipes
are distinct concerns managed by different roles, and inventory-platform
itself made the same split rather than a shared table with a type flag.
"""
from django.db import models
from apps.core.models import BaseModel
from .recipes import DishRecipe, ProductionRecipe
from .reference import Branch, PrepKitchen


class ActivityActionType(models.TextChoices):
    CREATED           = 'created',           'Created'
    UPDATED           = 'updated',           'Updated'
    RECALCULATED      = 'recalculated',      'Cost recalculated'
    DELETED           = 'deleted',           'Deleted'
    STANDARD_UPDATED  = 'standard_updated',  'QA standard updated'
    STANDARD_APPROVED = 'standard_approved', 'QA standard approved'
    PLATING_UPDATED   = 'plating_updated',   'Plating guide updated'
    PUBLISHED         = 'published',         'Published'
    # non-recipe actions (SystemActivityLog)
    ACTIVATED         = 'activated',         'Activated'
    DEACTIVATED       = 'deactivated',       'Deactivated'
    SNAPSHOT_TAKEN    = 'snapshot_taken',    'Snapshot taken'


class DishPriceHistory(BaseModel):
    dish_recipe   = models.ForeignKey(DishRecipe, on_delete=models.CASCADE, related_name='price_history')
    cost          = models.DecimalField(max_digits=12, decimal_places=3)
    selling_price = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = 'dish price history'

    def __str__(self):
        return f'{self.dish_recipe.name_en}: cost={self.cost} price={self.selling_price} @ {self.created_at:%Y-%m-%d}'


class ProductionCostHistory(BaseModel):
    production_recipe = models.ForeignKey(ProductionRecipe, on_delete=models.CASCADE, related_name='cost_history')
    cost              = models.DecimalField(max_digits=12, decimal_places=3)
    output_qty        = models.DecimalField(max_digits=12, decimal_places=3)

    class Meta(BaseModel.Meta):
        verbose_name_plural = 'production cost history'

    def __str__(self):
        return f'{self.production_recipe.name_en}: cost={self.cost} @ {self.created_at:%Y-%m-%d}'


class DishRecipeActivityLog(BaseModel):
    recipe      = models.ForeignKey(DishRecipe, on_delete=models.CASCADE, related_name='activity_log')
    action_type = models.CharField(max_length=20, choices=ActivityActionType.choices)
    description = models.TextField(blank=True)
    changed_by  = models.CharField(max_length=255, blank=True, help_text='Cookbook username who made the change.')
    # What the action actually changed — a `versioning.diff_states()` record
    # (fields from/to, ingredient lines added/removed/changed, steps,
    # allergens). Empty for actions with nothing to itemise (publish, QA).
    changes     = models.JSONField(default=dict, blank=True)
    # The recipe's version once this action was applied, and whether the
    # action is what created that version. An edit that leaves the version
    # alone is an *adjustment* (price, name, notes ...).
    version        = models.PositiveIntegerField(null=True, blank=True)
    is_new_version = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.recipe.name_en}: {self.get_action_type_display()} @ {self.created_at:%Y-%m-%d %H:%M}'


class ProductionRecipeActivityLog(BaseModel):
    recipe      = models.ForeignKey(ProductionRecipe, on_delete=models.CASCADE, related_name='activity_log')
    action_type = models.CharField(max_length=20, choices=ActivityActionType.choices)
    description = models.TextField(blank=True)
    changed_by  = models.CharField(max_length=255, blank=True, help_text='Cookbook username who made the change.')
    # What the action actually changed — a `versioning.diff_states()` record
    # (fields from/to, ingredient lines added/removed/changed, steps,
    # allergens). Empty for actions with nothing to itemise (publish, QA).
    changes     = models.JSONField(default=dict, blank=True)
    # The recipe's version once this action was applied, and whether the
    # action is what created that version. An edit that leaves the version
    # alone is an *adjustment* (price, name, notes ...).
    version        = models.PositiveIntegerField(null=True, blank=True)
    is_new_version = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.recipe.name_en}: {self.get_action_type_display()} @ {self.created_at:%Y-%m-%d %H:%M}'


class ActivityArea(models.TextChoices):
    """The feed's `kind` — what part of the system an action touched. The two
    recipe kinds also live here for a recipe *delete*, which can't sit on the
    recipe's own log (that cascades away with the recipe)."""
    DISH       = 'dish',       'Dish recipe'
    PRODUCTION = 'production', 'Production recipe'
    ITEM       = 'item',       'Inventory item'
    MENU       = 'menu',       'Menu'
    POS        = 'pos',        'POS modifiers'
    ADMIN      = 'admin',      'Administration'


class SystemActivityLog(BaseModel):
    """
    Every action that isn't an edit of a live recipe: inventory-item
    supplements (conversions, nutrition, storage, allergens), menus + specials
    + editions, POS modifiers, branches, prep kitchens, users, roles, and
    recipe deletes. Written by `apps.cookbook.audit`; merged into the same
    Activity feed as the two recipe logs.

    The subject is denormalised (id / label / code / link) on purpose: the log
    must outlive whatever it describes, deletes included. `branch_ref` /
    `prep_kitchen_ref` are only for scoping who may see the row.
    """
    area          = models.CharField(max_length=20, choices=ActivityArea.choices, db_index=True)
    action_type   = models.CharField(max_length=20, choices=ActivityActionType.choices)
    subject_type  = models.CharField(max_length=40, help_text='e.g. item_conversion, menu_period, user.')
    subject_id    = models.CharField(max_length=100, blank=True)
    subject_label = models.CharField(max_length=255, blank=True)
    subject_label_ar = models.CharField(max_length=255, blank=True)
    subject_code  = models.CharField(max_length=100, blank=True, help_text='SKU / recipe code / username.')
    subject_path  = models.CharField(max_length=255, blank=True, help_text='Frontend link, if it still exists.')
    description   = models.TextField(blank=True)
    changed_by    = models.CharField(max_length=255, blank=True, help_text='Cookbook username who made the change.')
    # `{fields: [{field, from, to}]}` — the same shape as a recipe change record.
    changes       = models.JSONField(default=dict, blank=True)
    branch_ref       = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    prep_kitchen_ref = models.ForeignKey(PrepKitchen, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    def __str__(self):
        return f'{self.subject_label or self.subject_type}: {self.get_action_type_display()} @ {self.created_at:%Y-%m-%d %H:%M}'
