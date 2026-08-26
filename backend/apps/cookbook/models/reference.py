"""
NOTE — Reference data for recipe authoring.
Every value here is real data pulled from "200 Lebanese Menu Cook Book.xlsm"
(sheets: Restaurant Information, Action Log's side lookup lists), not
placeholders — seeded via management command seed_cookbook_reference_data.

Kept deliberately separate from each other, on the user's explicit
instruction not to merge distinct concerns:
  - MenuCategory is what a CUSTOMER sees on the menu (Salad, Grill...).
  - Section is which KITCHEN STATION preps the dish (Salad, Grill, Bakery,
    Preparation...) and carries the avg salary used for labor-cost — the
    sheet's "Avg. Salary Per Section" table covers every company
    department, not just kitchen ones, so this doubles as the general
    department list too.
  - UnitScale is a single unit (g, ml, Tbs...); StandardMeasurementConversion
    is the FIXED global equivalence table between units (1 Tbs = 3 Ts =
    15 ml) — separate from apps.cookbook.models.item_supplement.
    ItemConversion, which is PER-INGREDIENT (density-dependent: 1 cup of
    flour != 1 cup of sugar in grams). Do not merge those two.
"""
from django.db import models
from apps.core.models import BaseModel


class MenuCategory(BaseModel):
    """Customer-facing menu section, e.g. 'Salad', 'Grill', 'Dish Of The Day'."""
    name          = models.CharField(max_length=100, unique=True)
    name_ar       = models.CharField(max_length=100, blank=True)
    menu_title_ar = models.CharField(max_length=150, blank=True,
                      help_text="Arabic heading printed on the menu — the sheet keeps this "
                                "separate from name_ar (it can differ).")
    sort_order    = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name_plural = 'menu categories'

    def __str__(self):
        return self.name


class Branch(BaseModel):
    """
    A Green Hills restaurant / outlet — Dine, Luma, WnR, etc. The sheet keys
    menus, costing snapshots and dish applicability by branch. DishRecipe.branch
    is still a free-text string for now; branch_ref points here and takes over
    in a later phase.
    """
    name_en    = models.CharField(max_length=100, unique=True)
    name_ar    = models.CharField(max_length=100, blank=True)
    code       = models.CharField(max_length=20, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name_en']
        verbose_name_plural = 'branches'

    def __str__(self):
        return self.name_en


class PrepKitchen(BaseModel):
    """
    A prep kitchen — the unit that produces prepared items (Bread, Sauce, Meat,
    Poultry…). ProductionRecipe.prep_kitchen_ref points here; prep cooks are
    scoped to one or more of these (see apps.accounts).

    Mirrors the Branch pattern: a thin local list, initially seeded, later
    linked to inventory-platform's production stores via inventory_store_id —
    which is also the join key for the planned batch / material-request flow
    (a prep kitchen receives a request, creates a batch, checks stock).
    """
    name_en           = models.CharField(max_length=100, unique=True)
    name_ar           = models.CharField(max_length=100, blank=True)
    code              = models.CharField(max_length=20, blank=True)
    sort_order        = models.PositiveIntegerField(default=0)
    inventory_store_id = models.CharField(
        max_length=64, blank=True,
        help_text="inventory-platform production-store id this prep kitchen maps to.")

    class Meta:
        ordering = ['sort_order', 'name_en']

    def __str__(self):
        return self.name_en


class Section(BaseModel):
    """
    A work section/department (kitchen station or general department).
    avg_monthly_salary (KWD) drives labor-cost calculation for recipes
    assigned to that section: labor_cost ≈ avg_monthly_salary / working
    hours-per-month * prep_time_minutes. Null where the source sheet had
    no valid figure (#DIV/0! — section with no staff currently assigned).
    """
    name               = models.CharField(max_length=100, unique=True)
    avg_monthly_salary = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                           help_text='KWD/month. Null if not currently computable (no staff assigned).')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Approver(BaseModel):
    """A chef or QA team member who can approve a recipe/standard."""
    name = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Allergen(BaseModel):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class ServiceStyle(BaseModel):
    """How the dish is served, e.g. 'Dine-in', 'Delivery', 'Catering'."""
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class UnitDimension(models.TextChoices):
    MASS   = 'mass',   'Mass'
    VOLUME = 'volume', 'Volume'
    COUNT  = 'count',  'Count / piece'
    LENGTH = 'length', 'Length'
    OTHER  = 'other',  'Other'


class UnitScale(BaseModel):
    """
    A single unit of measure used in recipe lines, e.g. code='g', description='Gram'.

    dimension + factor_to_canonical make units comparable for costing. The
    canonical unit per dimension is: mass → g, volume → ml, count → each,
    length → cm. So factor_to_canonical for 'Kg' is 1000, for 'Tbs' is 15.
    Cross-dimension conversions (Tbs of flour → g) are density-dependent and
    live per-SKU on ItemConversionLine, not here.
    """
    code        = models.CharField(max_length=20, unique=True)
    description = models.CharField(max_length=100)
    dimension   = models.CharField(max_length=10, choices=UnitDimension.choices,
                                   default=UnitDimension.OTHER)
    factor_to_canonical = models.DecimalField(max_digits=16, decimal_places=6, default=1,
                            help_text='Multiply a quantity in this unit by this to get the '
                                      "dimension's canonical unit (g / ml / each / cm).")

    class Meta:
        ordering = ['description']

    def __str__(self):
        return f'{self.code} ({self.description})'


class StandardMeasurementConversion(BaseModel):
    """
    Fixed global cooking-measurement equivalences (1 Tbs = 3 Ts = 15 ml =
    1/2 fl oz), independent of any ingredient. Up to 5 equivalent
    expressions per row, matching the source sheet's layout.
    """
    label   = models.CharField(max_length=50, help_text='The quantity this row defines, e.g. "1 Tbs".')
    equiv_1 = models.CharField(max_length=50, blank=True)
    equiv_2 = models.CharField(max_length=50, blank=True)
    equiv_3 = models.CharField(max_length=50, blank=True)
    equiv_4 = models.CharField(max_length=50, blank=True)
    equiv_5 = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.label


class TasteDescriptorCategory(models.TextChoices):
    APPEARANCE       = 'appearance',       'Appearance'
    COLOR            = 'color',            'Color'
    AROMA            = 'aroma',            'Aroma'
    TEXTURE          = 'texture',          'Texture'
    PRESENTATION     = 'presentation',     'Presentation'
    PRIMARY_FLAVOR   = 'primary_flavor',   'Primary flavor'
    SECONDARY_FLAVOR = 'secondary_flavor', 'Secondary flavor'
    AFTERTASTE       = 'aftertaste',       'Aftertaste'
    MOUTHFEEL        = 'mouthfeel',        'Mouthfeel'
    FRESHNESS        = 'freshness',        'Freshness standard'
    CRITICAL_DEFECT  = 'critical_defect',  'Critical defect (not allowed)'


class TasteDescriptor(BaseModel):
    """
    Suggested words for DishStandard's free-text sensory fields (appearance:
    'Glossy', 'Golden Brown'...; aftertaste: 'Lingering'...). Autocomplete
    source only — DishStandard's fields stay free text since real descriptions
    often combine several of these.
    """
    category = models.CharField(max_length=20, choices=TasteDescriptorCategory.choices)
    value    = models.CharField(max_length=100)

    class Meta:
        ordering = ['category', 'value']
        unique_together = ['category', 'value']

    def __str__(self):
        return f'{self.get_category_display()}: {self.value}'
