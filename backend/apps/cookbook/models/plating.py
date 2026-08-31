"""
NOTE — Plating guide

A kitchen-facing "how it leaves the pass" sheet for a dish: annotated plate
photos, the plate / vessel spec, garnish detail, the pickup window, and the
errors QA sees most often.

Deliberately separate from DishStandard (models/standards.py). That is the
sensory sign-off a QA assessor scores a served dish against; this is the
assembly instruction a line cook builds from — different audience, different
edit cadence, and DishStandard is already large.

Addressed by dish id, exactly like DishStandard: one OneToOne per DishRecipe.
Never versioned — editing the plating guide is not a recipe revision (the same
carve-out as swapping a dish photo).
"""
from django.db import models

from apps.core.models import BaseModel
from .reference import Approver
from .recipes import DishRecipe


class PlatingGuide(BaseModel):
    dish_recipe = models.OneToOneField(
        DishRecipe, on_delete=models.CASCADE, related_name='plating',
    )

    plate_spec            = models.CharField(max_length=255, blank=True,
                              help_text='Plate / vessel and prep, e.g. "28 cm white coupe, warmed".')
    garnish_spec_en       = models.TextField(blank=True)
    garnish_spec_ar       = models.TextField(blank=True)
    build_notes_en        = models.TextField(blank=True,
                              help_text='Component order and placement on the plate.')
    build_notes_ar        = models.TextField(blank=True)
    common_errors_en      = models.TextField(blank=True,
                              help_text='What QA sees go wrong most often.')
    common_errors_ar      = models.TextField(blank=True)
    pickup_window_seconds = models.PositiveIntegerField(null=True, blank=True,
                              help_text='Seconds from plate-up to hand-off before quality drops.')

    updated_by  = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    approved_by = models.ForeignKey(Approver, on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    def __str__(self):
        return f'Plating guide for {self.dish_recipe.name_en}'


class PlatingImage(BaseModel):
    """
    One reference photo for a plating guide, with numbered callout pins.

    `pins` is a list of {n, x, y, label_en, label_ar}. x / y are 0–1 fractions
    of the image's width / height, so a pin stays put when the image is
    re-cropped or rendered at any size.
    """
    guide      = models.ForeignKey(PlatingGuide, on_delete=models.CASCADE, related_name='images')
    image      = models.ImageField(upload_to='plating/')
    caption_en = models.CharField(max_length=255, blank=True)
    caption_ar = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    pins       = models.JSONField(default=list, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'created_at']

    def __str__(self):
        return f'{self.guide.dish_recipe.name_en} — plating photo {self.sort_order}'
