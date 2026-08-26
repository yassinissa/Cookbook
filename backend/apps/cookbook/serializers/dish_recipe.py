from rest_framework import serializers

from apps.accounts.access import ALL, access_for
from apps.cookbook.models import (
    Branch, DishRecipe, DishRecipeIngredient, DishRecipeStep, DishStandard,
    MenuCategory, Section, ServiceStyle, Approver, Allergen, UnitScale,
    DishPriceHistory, DishRecipeActivityLog, ActivityActionType,
)
from apps.cookbook.services import apply_cost
from apps.cookbook.nutrition import allergen_rollup
from apps.cookbook.versioning import archive_current_version, edit_is_a_new_version
from .reference import (
    MenuCategorySerializer, SectionSerializer, ServiceStyleSerializer,
    ApproverSerializer, AllergenSerializer, UnitScaleSerializer,
)
from .mixins import HidesCostingFields


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


class DishRecipeListSerializer(HidesCostingFields, serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    section_name  = serializers.CharField(source='section.name', read_only=True, default=None)
    ingredient_count = serializers.IntegerField(source='ingredients.count', read_only=True)
    has_standard = serializers.SerializerMethodField()

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'recipe_code', 'branch', 'category', 'category_name',
            'section', 'section_name', 'pos_item_name', 'selling_price', 'cost',
            'rating', 'rating_status', 'has_standard', 'version', 'is_current', 'ingredient_count', 'created_at',
        ]

    def get_has_standard(self, obj):
        return hasattr(obj, 'standard') and obj.standard is not None


class DishRecipeDetailSerializer(HidesCostingFields, serializers.ModelSerializer):
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
    allergen_rollup = serializers.SerializerMethodField()
    price_history = DishPriceHistorySerializer(many=True, read_only=True)
    activity_log  = DishRecipeActivityLogSerializer(many=True, read_only=True)

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'recipe_code', 'revision', 'revision_date',
            'branch', 'branch_ref', 'category', 'section',
            'service_style', 'allergens', 'allergen_rollup', 'pos_item_name', 'selling_price',
            'rating', 'rating_status', 'rating_date', 'taste_profile', 'image_url',
            'prep_time_minutes', 'expected_waste_pct',
            'include_labor_cost', 'labor_cost', 'cost', 'cost_breakdown', 'nutrition', 'food_cost_pct',
            'approved_by', 'qa_approved_by', 'approved_at', 'notes',
            'version', 'is_current', 'ingredients', 'steps', 'standard',
            'price_history', 'activity_log',
            'created_at', 'updated_at',
        ]

    def get_allergen_rollup(self, obj):
        return allergen_rollup(obj)

    def get_food_cost_pct(self, obj):
        fcp = (obj.cost_breakdown or {}).get('food_cost_pct')
        if fcp is not None:
            return fcp
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
            'name_en', 'name_ar', 'recipe_code', 'revision', 'revision_date',
            'branch', 'branch_ref', 'category', 'section', 'service_style',
            'allergens', 'pos_item_name', 'selling_price',
            'rating', 'rating_status', 'rating_date', 'taste_profile', 'image_url',
            'prep_time_minutes', 'expected_waste_pct', 'include_labor_cost',
            'approved_by', 'qa_approved_by', 'approved_at', 'notes',
            'ingredients', 'steps', 'standard',
        ]
        # labor_cost is recomputed on save, not accepted from the client

    def validate(self, attrs):
        """A scoped user can only write dishes within their branch scope; a
        singly-scoped user's new dishes default to that branch."""
        request = self.context.get('request')
        if not request:
            return attrs
        access = access_for(request)
        scope = access.scope.branch_ids
        if access.is_superuser or scope is ALL:
            return attrs

        chosen = attrs.get('branch_ref')
        if chosen is None and self.instance is None and len(scope) == 1:
            chosen = Branch.objects.filter(id=next(iter(scope))).first()
            attrs['branch_ref'] = chosen
        effective = chosen or getattr(self.instance, 'branch_ref', None)
        if effective is None or str(effective.id) not in scope:
            raise serializers.ValidationError(
                {'branch_ref': 'This dish must belong to a branch you are assigned to.'})
        return attrs

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

    # DishStandard fields that must be an object/number/date or nothing —
    # an empty string from the client is coerced to NULL.
    _STANDARD_NULLABLE = {
        f.name for f in DishStandard._meta.get_fields()
        if getattr(f, 'is_relation', False) or f.get_internal_type() in (
            'DecimalField', 'IntegerField', 'PositiveIntegerField', 'DateField', 'DateTimeField',
        )
    }

    def _save_standard(self, recipe, standard_data):
        if standard_data is None:
            return
        cleaned = {
            k: (None if (k in self._STANDARD_NULLABLE and v in ('', None)) else v)
            for k, v in standard_data.items()
        }
        DishStandard.objects.update_or_create(dish_recipe=recipe, defaults=cleaned)

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

        recipe = DishRecipe(**validated_data)
        apply_cost(recipe, ingredient_data)      # sets cost / labor_cost / cost_breakdown
        recipe.save()
        recipe.allergens.set(allergens)
        self._save_ingredients(recipe, ingredient_data)
        self._save_steps(recipe, step_data)
        self._save_standard(recipe, standard_data)
        self._snapshot_price(recipe)
        self._log(recipe, ActivityActionType.CREATED)
        return recipe

    def update(self, instance, validated_data):
        ingredient_data = validated_data.pop('ingredients', None)
        step_data       = validated_data.pop('steps', None)
        standard_data   = validated_data.pop('standard', None)
        allergens       = validated_data.pop('allergens', None)

        old_cost, old_price = instance.cost, instance.selling_price

        versioned = edit_is_a_new_version(instance, validated_data, ingredient_data, step_data)
        if versioned:
            archive_current_version(instance)          # snapshot the pre-edit state
            instance.version = (instance.version or 1) + 1

        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        if ingredient_data is not None:
            instance.ingredients.all().delete()
            self._save_ingredients(instance, ingredient_data)

        if step_data is not None:
            instance.steps.all().delete()
            self._save_steps(instance, step_data)

        if allergens is not None:
            instance.allergens.set(allergens)

        # recompute against whatever the ingredients are now
        apply_cost(instance, ingredient_data if ingredient_data is not None
                             else list(instance.ingredients.all()))
        instance.save()
        if standard_data is not None:
            self._save_standard(instance, standard_data)

        if instance.cost != old_cost or instance.selling_price != old_price:
            self._snapshot_price(instance)
        self._log(instance, ActivityActionType.UPDATED,
                  f'Revised to v{instance.version}' if versioned else '')
        return instance
