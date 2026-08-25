from rest_framework import serializers
from apps.cookbook.models import (
    ProductionRecipe, ProductionRecipeIngredient, ProductionRecipeStep,
)
from apps.cookbook.services import calculate_recipe_cost
from .reference import SectionSerializer, ApproverSerializer, UnitScaleSerializer


class ProductionRecipeIngredientSerializer(serializers.ModelSerializer):
    unit_detail = UnitScaleSerializer(source='unit', read_only=True)

    class Meta:
        model  = ProductionRecipeIngredient
        fields = ['id', 'order', 'item_sku', 'item_name_snapshot', 'prep_note', 'quantity', 'unit', 'unit_detail']


class ProductionRecipeStepSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProductionRecipeStep
        fields = ['id', 'step_number', 'instruction']


class ProductionRecipeListSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True, default=None)
    output_unit_code = serializers.CharField(source='output_unit.code', read_only=True, default=None)
    ingredient_count = serializers.IntegerField(source='ingredients.count', read_only=True)

    class Meta:
        model  = ProductionRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'prep_kitchen', 'section', 'section_name',
            'output_item_sku', 'output_qty', 'output_unit', 'output_unit_code',
            'cost', 'version', 'is_current', 'ingredient_count', 'created_at',
        ]


class ProductionRecipeDetailSerializer(serializers.ModelSerializer):
    section       = SectionSerializer(read_only=True)
    approved_by   = ApproverSerializer(read_only=True)
    qa_approved_by = ApproverSerializer(read_only=True)
    output_unit   = UnitScaleSerializer(read_only=True)
    ingredients   = ProductionRecipeIngredientSerializer(many=True, read_only=True)
    steps         = ProductionRecipeStepSerializer(many=True, read_only=True)
    cost_per_unit = serializers.SerializerMethodField()

    class Meta:
        model  = ProductionRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'prep_kitchen', 'section',
            'output_item_sku', 'output_qty', 'output_unit',
            'prep_time_minutes', 'expected_waste_pct', 'include_labor_cost',
            'labor_cost', 'cost', 'cost_per_unit',
            'approved_by', 'qa_approved_by', 'approved_at', 'notes',
            'version', 'is_current', 'ingredients', 'steps',
            'created_at', 'updated_at',
        ]

    def get_cost_per_unit(self, obj):
        if obj.output_qty and obj.output_qty > 0:
            return round(obj.cost / obj.output_qty, 3)
        return None


class ProductionRecipeWriteSerializer(serializers.ModelSerializer):
    ingredients = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    steps       = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model  = ProductionRecipe
        fields = [
            'name_en', 'name_ar', 'prep_kitchen', 'section',
            'output_item_sku', 'output_qty', 'output_unit',
            'prep_time_minutes', 'expected_waste_pct', 'include_labor_cost', 'labor_cost',
            'approved_by', 'qa_approved_by', 'approved_at', 'notes',
            'ingredients', 'steps',
        ]

    def _save_ingredients(self, recipe, ingredient_data):
        for i, ing in enumerate(ingredient_data):
            ProductionRecipeIngredient.objects.create(
                recipe=recipe,
                order=ing.get('order', i),
                item_sku=ing['item_sku'],
                item_name_snapshot=ing.get('item_name_snapshot', ''),
                prep_note=ing.get('prep_note', ''),
                quantity=ing['quantity'],
                unit_id=ing['unit'],
            )

    def _save_steps(self, recipe, step_data):
        for i, s in enumerate(step_data):
            ProductionRecipeStep.objects.create(
                recipe=recipe,
                step_number=s.get('step_number', i + 1),
                instruction=s['instruction'],
            )

    def create(self, validated_data):
        ingredient_data = validated_data.pop('ingredients', [])
        step_data       = validated_data.pop('steps', [])

        cost, unknown_skus = calculate_recipe_cost(ingredient_data)
        recipe = ProductionRecipe.objects.create(cost=cost, **validated_data)
        self._save_ingredients(recipe, ingredient_data)
        self._save_steps(recipe, step_data)
        recipe._unknown_skus = unknown_skus
        return recipe

    def update(self, instance, validated_data):
        ingredient_data = validated_data.pop('ingredients', None)
        step_data       = validated_data.pop('steps', None)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        unknown_skus = []
        if ingredient_data is not None:
            instance.ingredients.all().delete()
            self._save_ingredients(instance, ingredient_data)
            instance.cost, unknown_skus = calculate_recipe_cost(ingredient_data)

        if step_data is not None:
            instance.steps.all().delete()
            self._save_steps(instance, step_data)

        instance.save()
        instance._unknown_skus = unknown_skus
        return instance
