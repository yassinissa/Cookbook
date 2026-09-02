"""
NOTE — POS modifiers

A ModifierGroup is a named set of choices a POS attaches to a dish — "RoLL"
(pick Chicken / Lamb / Shrimp), "Egg Addition" (add cheese +0.75), "Mono"
(Spicy / Regular). Options carry a price delta and a *kind* that decides what,
if anything, gets published to inventory-platform's POS deduction pipeline:

  choice       a free required pick that doesn't change the recipe (Spicy/Regular)
  type         a variant with its own recipe — publishes a POSItemMapping
  addon        an extra ingredient on the base dish — publishes a POSAddonIngredient
  instruction  "no croutons" — base recipe only, nothing published

The match key for inventory-platform is `pos_mods_string`: the EXACT text the
Lavu "Sales by Item" report puts in its Mods column (e.g. "(C) CHICKEN"), which
is not the same as the POSLavu menu-builder name imported here.

The catalogue (groups + options + their publish data) is global. `DishModifierGroup`
hangs a group off a base dish (the POSItemMapping key is (dish.pos_item_name,
mods)). `MenuLineModifier` is per-branch menu display only — which groups a
branch shows, in what order, forced or optional.

Not MenuCategory (a customer menu section), not MenuPeriod (a dated change);
a ModifierOption with a SKU is a sale-time add, not a DishRecipeIngredient.
"""
from django.db import models

from apps.core.models import BaseModel
from .recipes import DishRecipe
from .reference import UnitScale
from .menu import MenuLine


class ModifierSelection(models.TextChoices):
    SINGLE = 'single', 'Pick one'
    MULTI  = 'multi',  'Pick several'


class ModifierOptionKind(models.TextChoices):
    CHOICE      = 'choice',      'Free choice'
    TYPE        = 'type',        'Variant (own recipe)'
    ADDON       = 'addon',       'Add-on ingredient'
    INSTRUCTION = 'instruction', 'Instruction / removal'


class ModifierRole(models.TextChoices):
    FORCED   = 'forced',   'Forced (required)'
    OPTIONAL = 'optional', 'Optional (add-on)'


class ModifierGroup(BaseModel):
    """A named set of modifier options — the POS 'modifier list'."""
    name_en    = models.CharField(max_length=120, unique=True)
    name_ar    = models.CharField(max_length=120, blank=True)
    selection  = models.CharField(max_length=10, choices=ModifierSelection.choices,
                                  default=ModifierSelection.SINGLE)
    min_select = models.PositiveSmallIntegerField(default=0,
                   help_text='Minimum options a customer must choose. 1 = a required pick.')
    max_select = models.PositiveSmallIntegerField(null=True, blank=True,
                   help_text='Maximum options. Null = no limit. N for a "pick N" set.')
    notes      = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['name_en']

    def __str__(self):
        return self.name_en


class ModifierOption(BaseModel):
    """One choice inside a group."""
    group           = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name='options')
    name_en         = models.CharField(max_length=160)
    name_ar         = models.CharField(max_length=160, blank=True)
    price_delta     = models.DecimalField(max_digits=12, decimal_places=3, default=0,
                        help_text='Added to the menu-line price when this option is chosen (KWD).')
    kind            = models.CharField(max_length=15, choices=ModifierOptionKind.choices,
                                       default=ModifierOptionKind.CHOICE)
    pos_mods_string = models.CharField(max_length=255, blank=True,
                        help_text="Exact text from the Lavu 'Sales by Item' report's Mods column — "
                                  "the key inventory-platform matches on.")
    # kind == 'type' — the variant's own recipe
    variant_recipe  = models.ForeignKey(DishRecipe, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='+')
    # kind == 'addon' — one extra ingredient to deduct
    item_sku        = models.CharField(max_length=100, blank=True)
    quantity        = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True,
                        help_text='Add-on ingredient quantity per portion.')
    unit            = models.ForeignKey(UnitScale, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='+')
    is_available    = models.BooleanField(default=True)
    sort_order      = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'name_en']
        constraints = [
            models.UniqueConstraint(fields=['group', 'name_en'], name='unique_option_name_per_group'),
        ]

    def __str__(self):
        return f'{self.group.name_en}: {self.name_en}'


class DishModifierGroup(BaseModel):
    """Attaches a group to a base dish. Global — this is what publishes as a
    POSItemMapping / POSAddonIngredient set."""
    dish         = models.ForeignKey(DishRecipe, on_delete=models.CASCADE, related_name='modifier_groups')
    group        = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name='dish_uses')
    default_role = models.CharField(max_length=10, choices=ModifierRole.choices,
                                    default=ModifierRole.OPTIONAL)
    sort_order   = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['dish', 'group'], name='unique_group_per_dish'),
        ]

    def __str__(self):
        return f'{self.dish.name_en} · {self.group.name_en}'


class MenuLineModifier(BaseModel):
    """Per-branch menu display of a group on one menu line — availability,
    ordering, and a role that can override the dish default. Not published."""
    menu_line  = models.ForeignKey(MenuLine, on_delete=models.CASCADE, related_name='modifiers')
    group      = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name='menu_uses')
    role       = models.CharField(max_length=10, choices=ModifierRole.choices,
                                  default=ModifierRole.OPTIONAL)
    is_shown   = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['menu_line', 'group'], name='unique_group_per_menu_line'),
        ]

    def __str__(self):
        return f'{self.menu_line} · {self.group.name_en}'
