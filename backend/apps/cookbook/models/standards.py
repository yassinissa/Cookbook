"""
NOTE — QA/QC sensory standards
From the "Dish Standards Database" sheet — a separate, deeper layer on
top of the recipe itself. Not every dish has one yet.
"""
from django.db import models
from apps.core.models import BaseModel
from .reference import Approver
from .recipes import DishRecipe


class DishStandard(BaseModel):
    dish_recipe            = models.OneToOneField(DishRecipe, on_delete=models.CASCADE, related_name='standard')

    service_style          = models.CharField(max_length=100, blank=True)
    portion_weight_g       = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    portion_tolerance_g    = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    serving_temp_c         = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    temp_tolerance_c       = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    holding_time_minutes   = models.PositiveIntegerField(null=True, blank=True)

    # Free text — real descriptions often combine several TasteDescriptor
    # suggestion words (see apps.cookbook.models.reference), not just one.
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

    qa_approved_by         = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True,
                               related_name='+')
    approval_date          = models.DateField(null=True, blank=True)

    def __str__(self):
        return f'Standard for {self.dish_recipe.name_en}'
