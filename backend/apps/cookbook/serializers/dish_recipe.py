from rest_framework import serializers
from apps.cookbook.models import (
    DishRecipe, DishRecipeIngredient, DishRecipeStep, DishStandard,
    MenuCategory, Section, ServiceStyle, Approver, Allergen, UnitScale,
    DishPriceHistory, DishRecipeActivityLog, ActivityActionType,
)
from apps.cookbook.services import calculate_recipe_cost
from .reference import (
    MenuCategorySerializer, SectionSerializer, ServiceStyleSerializer,
    ApproverSerializer, AllergenSerializer, UnitScaleSerializer,
)


class DishRecipeIngredientSerializer(serializers.ModelSerializer):
    unit_detail = UnitScaleSerializer(source='unit', read_only=True)

    class Meta:
        model  = DishRecipeIngredient
        fields = ['id', 'order', 'item_sku', 'item_name_snapshot', 'prep_note', 'quantity', 'unit', 'unit_detail']


class DishRecipeStepSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DishRecipeStep
        fields = ['id', 'step_number', 'instruction']


class DishStandardSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DishStandard
        exclude = ['dish_recipe']


class DishPriceHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = DishPriceHistory
        fields = ['id', 'cost', 'selling_price', 'created_at']


class DishRecipeActivityLogSerializer(serializers.ModelSerializer):
    action_type_display = serializers.CharField(source='get_action_type_display', read_only=True)

    class Meta:
        model  = DishRecipeActivityLog
        fields = ['id', 'action_type', 'action_type_display', 'description', 'changed_by', 'created_at']


class DishRecipeListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    section_name  = serializers.CharField(source='section.name', read_only=True, default=None)
    ingredient_count = serializers.IntegerField(source='ingredients.count', read_only=True)

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'branch', 'category', 'category_name',
            'section', 'section_name', 'pos_item_name', 'selling_price', 'cost',
            'rating', 'version', 'is_current', 'ingredient_count', 'created_at',
        ]


class DishRecipeDetailSerializer(serializers.ModelSerializer):
    category      = MenuCategorySerializer(read_only=True)
    section       = SectionSerializer(read_only=True)
    service_style = ServiceStyleSerializer(read_only=True)
    approved_by   = ApproverSerializer(read_only=True)
    qa_approved_by = ApproverSerializer(read_only=True)
    allergens     = AllergenSerializer(many=True, read_only=True)
    ingredients   = DishRecipeIngredientSerializer(many=True, read_only=True)
    steps         = DishRecipeStepSerializer(many=True, read_only=True)
    standard      = DishStandardSerializer(read_only=True)
    food_cost_pct = serializers.SerializerMethodField()
    price_history = DishPriceHistorySerializer(many=True, read_only=True)
    activity_log  = DishRecipeActivityLogSerializer(many=True, read_only=True)

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'branch', 'category', 'section',
            'service_style', 'allergens', 'pos_item_name', 'selling_price',
            'rating', 'taste_profile', 'prep_time_minutes', 'expected_waste_pct',
            'include_labor_cost', 'labor_cost', 'cost', 'food_cost_pct',
            'approved_by', 'qa_approved_by', 'approved_at', 'notes',
            'version', 'is_current', 'ingredients', 'steps', 'standard',
            'price_history', 'activity_log',
            'created_at', 'updated_at',
        ]

    def get_food_cost_pct(self, obj):
        if obj.selling_price and obj.selling_price > 0:
            return round((obj.cost / obj.selling_price) * 100, 2)
        return None


class DishRecipeWriteSerializer(serializers.ModelSerializer):
    """
    Nested writable: ingredients/steps are replaced wholesale on every
    save (delete-and-recreate), same convention as inventory-platform's
    own DishRecipeWriteSerializer. `standard` is upserted separately.
    """
    ingredients = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    steps       = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    standard    = serializers.DictField(write_only=True, required=False, allow_null=True)
    allergens   = serializers.PrimaryKeyRelatedField(queryset=Allergen.objects.all(), many=True, required=False)

    class Meta:
        model  = DishRecipe
        fields = [
            'name_en', 'name_ar', 'branch', 'category', 'section', 'service_style',
            'allergens', 'pos_item_name', 'selling_price', 'rating', 'taste_profile',
            'prep_time_minutes', 'expected_waste_pct', 'include_labor_cost', 'labor_cost',
            'approved_by', 'qa_approved_by', 'approved_at', 'notes',
            'ingredients', 'steps', 'standard',
        ]

    def _save_ingredients(self, recipe, ingredient_data):
        for i, ing in enumerate(ingredient_data):
            DishRecipeIngredient.objects.create(
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
            DishRecipeStep.objects.create(
                recipe=recipe,
                step_number=s.get('step_number', i + 1),
                instruction=s['instruction'],
            )

    def _save_standard(self, recipe, standard_data):
        if standard_data is None:
            return
        DishStandard.objects.update_or_create(dish_recipe=recipe, defaults=standard_data)

    def _changed_by(self):
        request = self.context.get('request')
        return getattr(getattr(request, 'user', None), 'username', '') if request else ''

    def _snapshot_price(self, recipe):
        DishPriceHistory.objects.create(dish_recipe=recipe, cost=recipe.cost, selling_price=recipe.selling_price)

    def _log(self, recipe, action_type, description=''):
        DishRecipeActivityLog.objects.create(
            recipe=recipe, action_type=action_type, description=description, changed_by=self._changed_by(),
        )

    def create(self, validated_data):
        ingredient_data = validated_data.pop('ingredients', [])
        step_data       = validated_data.pop('steps', [])
        standard_data   = validated_data.pop('standard', None)
        allergens       = validated_data.pop('allergens', [])

        cost, unknown_skus = calculate_recipe_cost(ingredient_data)
        recipe = DishRecipe.objects.create(cost=cost, **validated_data)
        recipe.allergens.set(allergens)
        self._save_ingredients(recipe, ingredient_data)
        self._save_steps(recipe, step_data)
        self._save_standard(recipe, standard_data)
        recipe._unknown_skus = unknown_skus  # surfaced by the view, not stored
        self._snapshot_price(recipe)
        self._log(recipe, ActivityActionType.CREATED)
        return recipe

    def update(self, instance, validated_data):
        ingredient_data = validated_data.pop('ingredients', None)
        step_data       = validated_data.pop('steps', None)
        standard_data   = validated_data.pop('standard', None)
        allergens       = validated_data.pop('allergens', None)

        old_cost, old_price = instance.cost, instance.selling_price
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

        if allergens is not None:
            instance.allergens.set(allergens)

        instance.save()
        if standard_data is not None:
            self._save_standard(instance, standard_data)
        instance._unknown_skus = unknown_skus

        if instance.cost != old_cost or instance.selling_price != old_price:
            self._snapshot_price(instance)
        self._log(instance, ActivityActionType.UPDATED)
        return instance
