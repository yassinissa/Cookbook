"""
Standalone QA/QC standard serializers.

The standard is a OneToOne on DishRecipe (see models/standards.py). The
Standards screen addresses it *by dish* — the list is one row per current
dish so QA can see which dishes still lack a standard — so these
serializers take a DishRecipe as their instance, not a DishStandard.
"""
from rest_framework import serializers

from apps.cookbook.models import DishRecipe, DishStandard
from .dish_recipe import DishStandardSerializer
from .reference import ApproverSerializer

# Which groups of fields count toward "spec coverage" — one point per group
# that has at least one value filled in.
_COVERAGE_GROUPS = {
    'portioning': ['portion_weight_g', 'serving_temp_c', 'holding_time_minutes'],
    'sensory': ['appearance', 'color', 'aroma', 'texture', 'presentation'],
    'flavour': ['primary_flavor', 'secondary_flavor', 'aftertaste', 'mouthfeel'],
    'taste_bands': [f'{axis}_target' for axis in (
        'sweetness', 'saltiness', 'sourness', 'bitterness',
        'umami', 'spice', 'richness', 'smokiness',
    )],
    'defects': ['critical_defects_not_allowed', 'freshness_standard'],
}
COVERAGE_TOTAL = len(_COVERAGE_GROUPS)


def _group_filled(std, fields):
    return any(getattr(std, f, None) not in (None, '') for f in fields)


def spec_coverage(std):
    if std is None:
        return {'filled': 0, 'total': COVERAGE_TOTAL}
    filled = sum(_group_filled(std, fields) for fields in _COVERAGE_GROUPS.values())
    return {'filled': filled, 'total': COVERAGE_TOTAL}


def needs_review(std):
    """Has a standard, but it's either never been approved or was edited
    after its last approval."""
    if std is None:
        return False
    if not (std.qa_approved_by_id and std.approval_date):
        return True
    return std.updated_at.date() > std.approval_date


def _taste_axis_count(std):
    if std is None:
        return 0
    return sum(
        getattr(std, f'{axis}_target', None) is not None
        for axis in ('sweetness', 'saltiness', 'sourness', 'bitterness',
                     'umami', 'spice', 'richness', 'smokiness')
    )


class DishStandardListSerializer(serializers.ModelSerializer):
    """One row per current dish — shows the standard's headline specs plus
    whether it exists / is approved / has drifted since approval."""
    category_name       = serializers.CharField(source='category.name', read_only=True, default=None)
    has_standard        = serializers.SerializerMethodField()
    is_approved         = serializers.SerializerMethodField()
    qa_approved_by_name = serializers.SerializerMethodField()
    approval_date       = serializers.SerializerMethodField()
    portion_weight_g    = serializers.SerializerMethodField()
    serving_temp_c      = serializers.SerializerMethodField()
    holding_time_minutes = serializers.SerializerMethodField()
    taste_axis_count    = serializers.SerializerMethodField()
    spec_coverage       = serializers.SerializerMethodField()
    needs_review        = serializers.SerializerMethodField()

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'recipe_code', 'branch', 'branch_ref',
            'category', 'category_name', 'rating_status',
            'has_standard', 'is_approved', 'qa_approved_by_name', 'approval_date',
            'portion_weight_g', 'serving_temp_c', 'holding_time_minutes',
            'taste_axis_count', 'spec_coverage', 'needs_review',
        ]

    def _std(self, obj):
        return getattr(obj, 'standard', None)

    def get_has_standard(self, obj):
        return self._std(obj) is not None

    def get_is_approved(self, obj):
        std = self._std(obj)
        return bool(std and std.qa_approved_by_id and std.approval_date)

    def get_qa_approved_by_name(self, obj):
        std = self._std(obj)
        return std.qa_approved_by.name if std and std.qa_approved_by_id else None

    def get_approval_date(self, obj):
        std = self._std(obj)
        return std.approval_date if std else None

    def get_portion_weight_g(self, obj):
        std = self._std(obj)
        return str(std.portion_weight_g) if std and std.portion_weight_g is not None else None

    def get_serving_temp_c(self, obj):
        std = self._std(obj)
        return str(std.serving_temp_c) if std and std.serving_temp_c is not None else None

    def get_holding_time_minutes(self, obj):
        std = self._std(obj)
        return std.holding_time_minutes if std else None

    def get_taste_axis_count(self, obj):
        return _taste_axis_count(self._std(obj))

    def get_spec_coverage(self, obj):
        return spec_coverage(self._std(obj))

    def get_needs_review(self, obj):
        return needs_review(self._std(obj))


class DishStandardDetailSerializer(serializers.ModelSerializer):
    """Dish header + the full nested standard (or null)."""
    category      = serializers.CharField(source='category.name', read_only=True, default=None)
    section       = serializers.CharField(source='section.name', read_only=True, default=None)
    standard      = DishStandardSerializer(read_only=True)
    spec_coverage = serializers.SerializerMethodField()
    needs_review  = serializers.SerializerMethodField()
    qa_approved_by = serializers.SerializerMethodField()

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'recipe_code', 'revision',
            'branch', 'branch_ref', 'category', 'section', 'image_url',
            'rating', 'rating_status', 'taste_profile', 'version',
            'standard', 'spec_coverage', 'needs_review', 'qa_approved_by',
            'updated_at',
        ]

    def get_spec_coverage(self, obj):
        return spec_coverage(getattr(obj, 'standard', None))

    def get_needs_review(self, obj):
        return needs_review(getattr(obj, 'standard', None))

    def get_qa_approved_by(self, obj):
        std = getattr(obj, 'standard', None)
        if std and std.qa_approved_by_id:
            return ApproverSerializer(std.qa_approved_by).data
        return None


class DishStandardWriteSerializer(serializers.ModelSerializer):
    """Upsert the DishStandard for a dish. Empty strings on numeric / FK /
    date fields are coerced to NULL. Does NOT touch the recipe or its
    version / cost — a QA edit is not a recipe edit."""
    class Meta:
        model  = DishStandard
        exclude = ['dish_recipe', 'id', 'created_at', 'updated_at', 'is_active']

    _NULLABLE = {
        f.name for f in DishStandard._meta.get_fields()
        if getattr(f, 'is_relation', False) or getattr(f, 'get_internal_type', lambda: '')() in (
            'DecimalField', 'IntegerField', 'PositiveIntegerField', 'DateField', 'DateTimeField',
        )
    }

    def to_internal_value(self, data):
        cleaned = {
            k: (None if (k in self._NULLABLE and v in ('', None)) else v)
            for k, v in data.items()
        }
        return super().to_internal_value(cleaned)
