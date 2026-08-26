"""
NOTE — Menus

A Menu is the set of dishes a branch actually offers, with a per-branch menu
price that may differ from the recipe's own selling_price. Mirrors the source
workbook's per-branch "Menu" sheets (Dine Menu, Luma Menu, …).

MenuSnapshot / MenuSnapshotLine replace the manual "The Menu Copy" →
"Menu History" copy-paste: a snapshot freezes every line's cost + price + food
cost % at a point in time, so cost/price trends can be charted.
"""
from django.db import models

from apps.core.models import BaseModel
from .recipes import DishRecipe
from .reference import Branch


class Menu(BaseModel):
    branch          = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='menus')
    name            = models.CharField(max_length=120, blank=True,
                        help_text='Defaults to "<Branch> Menu".')
    name_ar         = models.CharField(max_length=120, blank=True)
    notes           = models.TextField(blank=True)
    last_snapshot_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=['branch'], condition=models.Q(is_active=True),
                                    name='one_active_menu_per_branch'),
        ]

    def __str__(self):
        return self.name or f'{self.branch.name_en} Menu'


class MenuLine(BaseModel):
    menu         = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='lines')
    dish         = models.ForeignKey(DishRecipe, on_delete=models.PROTECT, related_name='menu_lines')
    menu_price   = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True,
                     help_text='Price on this branch menu. Falls back to the recipe selling_price.')
    pos_name     = models.CharField(max_length=255, blank=True)
    image_url    = models.URLField(blank=True)
    sort_order   = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'id']
        unique_together = ['menu', 'dish']

    def __str__(self):
        return f'{self.dish.name_en} @ {self.menu}'

    @property
    def effective_price(self):
        return self.menu_price if self.menu_price is not None else self.dish.selling_price


class MenuSnapshot(BaseModel):
    menu     = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='snapshots')
    taken_by = models.CharField(max_length=255, blank=True)
    label    = models.CharField(max_length=120, blank=True)

    class Meta(BaseModel.Meta):
        pass

    def __str__(self):
        return f'{self.menu} snapshot @ {self.created_at:%Y-%m-%d %H:%M}'


class MenuSnapshotLine(BaseModel):
    snapshot       = models.ForeignKey(MenuSnapshot, on_delete=models.CASCADE, related_name='lines')
    dish_name      = models.CharField(max_length=255)
    recipe_code    = models.CharField(max_length=30, blank=True)
    category       = models.CharField(max_length=100, blank=True)
    cost           = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    menu_price     = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    food_cost_pct  = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['dish_name']
