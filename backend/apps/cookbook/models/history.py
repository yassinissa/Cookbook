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


class ActivityActionType(models.TextChoices):
    CREATED           = 'created',           'Created'
    UPDATED           = 'updated',           'Updated'
    RECALCULATED      = 'recalculated',      'Cost recalculated'
    DELETED           = 'deleted',           'Deleted'
    STANDARD_UPDATED  = 'standard_updated',  'QA standard updated'
    STANDARD_APPROVED = 'standard_approved', 'QA standard approved'
    PLATING_UPDATED   = 'plating_updated',   'Plating guide updated'
    PUBLISHED         = 'published',         'Published to inventory'


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

    def __str__(self):
        return f'{self.recipe.name_en}: {self.get_action_type_display()} @ {self.created_at:%Y-%m-%d %H:%M}'


class ProductionRecipeActivityLog(BaseModel):
    recipe      = models.ForeignKey(ProductionRecipe, on_delete=models.CASCADE, related_name='activity_log')
    action_type = models.CharField(max_length=20, choices=ActivityActionType.choices)
    description = models.TextField(blank=True)
    changed_by  = models.CharField(max_length=255, blank=True, help_text='Cookbook username who made the change.')

    def __str__(self):
        return f'{self.recipe.name_en}: {self.get_action_type_display()} @ {self.created_at:%Y-%m-%d %H:%M}'
