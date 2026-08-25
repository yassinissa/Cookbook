from rest_framework import serializers
from apps.cookbook.models import (
    MenuCategory, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor,
)


class MenuCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuCategory
        fields = ['id', 'name']


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name', 'avg_monthly_salary']


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
        fields = ['id', 'code', 'description']


class StandardMeasurementConversionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StandardMeasurementConversion
        fields = ['id', 'label', 'equiv_1', 'equiv_2', 'equiv_3', 'equiv_4', 'equiv_5']


class TasteDescriptorSerializer(serializers.ModelSerializer):
    class Meta:
        model = TasteDescriptor
        fields = ['id', 'category', 'value']
