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
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'menu categories'

    def __str__(self):
        return self.name


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


class UnitScale(BaseModel):
    """A single unit of measure used in recipe lines, e.g. code='g', description='Gram'."""
    code        = models.CharField(max_length=20, unique=True)
    description = models.CharField(max_length=100)

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
    APPEARANCE = 'appearance', 'Appearance'
    COLOR      = 'color',      'Color'
    AROMA      = 'aroma',      'Aroma'
    TEXTURE    = 'texture',    'Texture'


class TasteDescriptor(BaseModel):
    """
    Suggested words for DishStandard's free-text appearance/color/aroma/
    texture fields (e.g. appearance: 'Glossy', 'Golden Brown'...). Autocomplete
    source only — DishStandard's fields stay free text since real
    descriptions often combine several of these.
    """
    category = models.CharField(max_length=20, choices=TasteDescriptorCategory.choices)
    value    = models.CharField(max_length=100)

    class Meta:
        ordering = ['category', 'value']
        unique_together = ['category', 'value']

    def __str__(self):
        return f'{self.get_category_display()}: {self.value}'
