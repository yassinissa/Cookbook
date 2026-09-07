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


class ModifierDeltaDirection(models.TextChoices):
    ADD    = 'add',    'Adds an ingredient'
    REMOVE = 'remove', 'Removes an ingredient'


class DeductionStatus(models.TextChoices):
    READY      = 'ready',       'Ready — consumption effect is defined'
    NEEDS_DATA = 'needs_data',  'Needs data — no consumption effect defined yet'
    NO_IMPACT  = 'no_impact',   'No stock impact'


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
    # DEPRECATED — kind == 'addon' single extra ingredient. Superseded by the
    # `deltas` child rows (ModifierOptionIngredient), which handle 1..N
    # ingredients and removals uniformly. Kept for one release so a rollback is
    # safe; the 0025 data migration copies these into a delta row. Do not read
    # these directly — use `deltas`.
    item_sku        = models.CharField(max_length=100, blank=True)
    quantity        = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True,
                        help_text='DEPRECATED — see `deltas`.')
    unit            = models.ForeignKey(UnitScale, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='+')
    # Every option resolves to a defined consumption effect. This flag is the
    # explicit "this option never moves stock" answer (doneness levels, a free
    # equivalent choice) — it makes `deduction_status` unambiguous instead of
    # leaving a bare choice/instruction in limbo.
    no_consumption_impact = models.BooleanField(default=False,
                              help_text='This option does not change what the kitchen consumes.')
    is_available    = models.BooleanField(default=True)
    sort_order      = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'name_en']
        constraints = [
            models.UniqueConstraint(fields=['group', 'name_en'], name='unique_option_name_per_group'),
        ]

    def __str__(self):
        return f'{self.group.name_en}: {self.name_en}'

    @property
    def deduction_status(self):
        """`ready` / `needs_data` / `no_impact` — every option must resolve to
        one of these; `needs_data` is the visible worklist state."""
        if self.no_consumption_impact:
            return DeductionStatus.NO_IMPACT
        if self.kind == ModifierOptionKind.TYPE:
            variant = self.variant_recipe
            if variant and variant.inventory_recipe_id:
                return DeductionStatus.READY
            if self._delta_list:
                return DeductionStatus.READY
            return DeductionStatus.NEEDS_DATA
        # choice / addon / instruction: defined iff it carries deltas
        return DeductionStatus.READY if self._delta_list else DeductionStatus.NEEDS_DATA

    @property
    def _delta_list(self):
        # prefetch-friendly: uses the cached `deltas` relation when present
        return list(self.deltas.all())

    @property
    def missing(self):
        """Human-readable reasons this option is `needs_data` (empty otherwise)."""
        if self.deduction_status != DeductionStatus.NEEDS_DATA:
            return []
        if self.kind == ModifierOptionKind.TYPE:
            if self.variant_recipe and not self.variant_recipe.inventory_recipe_id:
                return [f'variant recipe "{self.variant_recipe.name_en}" is not published yet']
            return ['needs a published variant recipe, or ingredient deltas, or "no stock impact"']
        if self.kind == ModifierOptionKind.ADDON:
            return ['needs the ingredient(s) it adds, or "no stock impact"']
        if self.kind == ModifierOptionKind.INSTRUCTION:
            return ['needs the ingredient(s) it removes, or "no stock impact"']
        return ['confirm it changes no stock ("no stock impact"), or add ingredient deltas']


class ModifierOptionIngredient(BaseModel):
    """One ingredient delta for a modifier option — `+` for an add-on, `-` for a
    removal. Several rows = a multi-ingredient add-on or removal. Same SKU-
    reference pattern as IngredientLine (references an inventory item by SKU)."""
    option             = models.ForeignKey(ModifierOption, on_delete=models.CASCADE, related_name='deltas')
    item_sku           = models.CharField(max_length=100,
                           help_text='SKU of the inventory-platform Item this delta consumes / credits.')
    item_name_snapshot = models.CharField(max_length=255, blank=True)
    quantity           = models.DecimalField(max_digits=12, decimal_places=3,
                           help_text='Amount per one portion sold (always positive; `direction` sets the sign).')
    unit               = models.ForeignKey(UnitScale, on_delete=models.PROTECT, null=True, blank=True,
                                           related_name='+')
    direction          = models.CharField(max_length=6, choices=ModifierDeltaDirection.choices,
                                           default=ModifierDeltaDirection.ADD)
    sort_order         = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['option', 'item_sku', 'direction'],
                                    name='unique_delta_per_option_sku_direction'),
        ]

    def __str__(self):
        sign = '+' if self.direction == ModifierDeltaDirection.ADD else '-'
        return f'{self.option.name_en}: {sign}{self.quantity} {self.item_sku}'


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
