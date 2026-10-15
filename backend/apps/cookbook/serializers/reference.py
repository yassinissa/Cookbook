from rest_framework import serializers
from apps.cookbook.models import (
    MenuCategory, Branch, PrepKitchen, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor,
)


class MenuCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuCategory
        fields = ['id', 'name', 'name_ar', 'menu_title_ar', 'sort_order', 'branch_ids']

    branch_ids = serializers.PrimaryKeyRelatedField(
        source='branches', many=True, queryset=Branch.objects.all(), required=False)


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ['id', 'name_en', 'name_ar', 'slug', 'sort_order', 'category_ids', 'section_ids']
        # slug is auto-derived from name_en on first save (Branch.save()) — it's
        # the brand key sent to inventory-platform on every publish, so it must
        # never change under a recipe that's already been published there.
        read_only_fields = ['slug']

    # The brand's own category / section lists (see models.reference.brand_options).
    # Empty = the brand uses the shared, unassigned items.
    category_ids = serializers.PrimaryKeyRelatedField(
        source='menu_categories', many=True, queryset=MenuCategory.objects.all(), required=False)
    section_ids = serializers.PrimaryKeyRelatedField(
        source='sections', many=True, queryset=Section.objects.all(), required=False)


class PrepKitchenSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrepKitchen
        fields = ['id', 'name_en', 'name_ar', 'code', 'sort_order', 'inventory_store_id']


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name', 'avg_monthly_salary', 'branch_ids']
        read_only_fields = ['avg_monthly_salary']   # labour costing — not edited from the Brands screen

    branch_ids = serializers.PrimaryKeyRelatedField(
        source='branches', many=True, queryset=Branch.objects.all(), required=False)


class ApproverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Approver
        fields = ['id', 'name']


class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = ['id', 'name']


class ServiceStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceStyle
        fields = ['id', 'name']


class UnitScaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitScale
        fields = ['id', 'code', 'description', 'dimension', 'factor_to_canonical']


class StandardMeasurementConversionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StandardMeasurementConversion
        fields = ['id', 'label', 'equiv_1', 'equiv_2', 'equiv_3', 'equiv_4', 'equiv_5']


class TasteDescriptorSerializer(serializers.ModelSerializer):
    class Meta:
        model = TasteDescriptor
        fields = ['id', 'category', 'value']
