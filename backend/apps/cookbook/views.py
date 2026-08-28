from rest_framework import viewsets, mixins
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import ScopedQuerySetMixin, capability_required

from .models import (
    MenuCategory, Branch, PrepKitchen, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor, DishRecipe, ProductionRecipe,
    DishPriceHistory, DishRecipeActivityLog, ProductionCostHistory,
    ProductionRecipeActivityLog, ActivityActionType,
    ItemConversion, ItemNutrition,
)
from .serializers import (
    MenuCategorySerializer, BranchSerializer, SectionSerializer, ApproverSerializer,
    AllergenSerializer, ServiceStyleSerializer, UnitScaleSerializer,
    StandardMeasurementConversionSerializer, TasteDescriptorSerializer,
    DishRecipeListSerializer, DishRecipeDetailSerializer, DishRecipeWriteSerializer,
    ProductionRecipeListSerializer, ProductionRecipeDetailSerializer, ProductionRecipeWriteSerializer,
    ItemConversionSerializer, ItemNutritionSerializer,
)
from .serializers.reference import PrepKitchenSerializer
from .services import apply_cost
from .publishing import RecipePublishError, publish_dish_recipe, publish_production_recipe
from .versioning import diff_recipes, diff_summary


class ReadOnlyReferenceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Reference data is seeded/edited via Django admin, not this API."""
    permission_classes = [IsAuthenticated]
    pagination_class = None


class MenuCategoryViewSet(ReadOnlyReferenceViewSet):
    queryset = MenuCategory.objects.all()
    serializer_class = MenuCategorySerializer


class BranchViewSet(ReadOnlyReferenceViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer


class PrepKitchenViewSet(ReadOnlyReferenceViewSet):
    queryset = PrepKitchen.objects.all()
    serializer_class = PrepKitchenSerializer


class SectionViewSet(ReadOnlyReferenceViewSet):
    queryset = Section.objects.all()
    serializer_class = SectionSerializer


class ApproverViewSet(ReadOnlyReferenceViewSet):
    queryset = Approver.objects.all()
    serializer_class = ApproverSerializer


class AllergenViewSet(ReadOnlyReferenceViewSet):
    queryset = Allergen.objects.all()
    serializer_class = AllergenSerializer


class ServiceStyleViewSet(ReadOnlyReferenceViewSet):
    queryset = ServiceStyle.objects.all()
    serializer_class = ServiceStyleSerializer


class UnitScaleViewSet(ReadOnlyReferenceViewSet):
    queryset = UnitScale.objects.all()
    serializer_class = UnitScaleSerializer


class StandardMeasurementConversionViewSet(ReadOnlyReferenceViewSet):
    queryset = StandardMeasurementConversion.objects.all()
    serializer_class = StandardMeasurementConversionSerializer


class TasteDescriptorViewSet(ReadOnlyReferenceViewSet):
    queryset = TasteDescriptor.objects.all()
    serializer_class = TasteDescriptorSerializer


class RecipeViewSetBase(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    """
    Shared create/update/recalculate behavior for both recipe types: the
    write serializer stashes _unknown_skus (item_sku not found in
    inventory-platform) on the instance, surfaced here as a response
    warning rather than a hard failure — the recipe still saves.
    """
    permission_classes = [IsAuthenticated]
    detail_serializer_class = None  # set by subclass

    def get_queryset(self):
        """The list shows only current versions; archived revisions stay
        retrievable by id (?all_versions=1 also lists them)."""
        qs = super().get_queryset()
        if self.action == 'list' and self.request.query_params.get('all_versions') != '1':
            qs = qs.filter(is_current=True)
        return qs

    def _response_with_warnings(self, instance, status_code=200):
        detail = self.detail_serializer_class(instance).data
        warnings = [f'Unknown item SKU (not costed): {s}' for s in getattr(instance, '_unknown_skus', [])]
        for issue in getattr(instance, '_cost_issues', []):
            if issue['status'] != 'unknown_sku':
                warnings.append(f"{issue['sku']}: {issue['detail'] or issue['status']}")
        if warnings:
            detail['_warnings'] = warnings
        return Response(detail, status=status_code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return self._response_with_warnings(instance, status_code=201)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return self._response_with_warnings(instance)

    def _snapshot_and_log_recalculate(self, recipe, request):
        """Override per recipe type: write a history row + activity log entry."""
        raise NotImplementedError

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """Recompute cost from current item prices + conversions and persist."""
        recipe = self.get_object()
        apply_cost(recipe)
        recipe.save(update_fields=['cost', 'labor_cost', 'cost_breakdown'])
        self._snapshot_and_log_recalculate(recipe, request)
        return self._response_with_warnings(recipe)

    # ── publish to inventory-platform ────────────────────────────────────
    def _publish_to_inventory(self, recipe):
        """Override per recipe type: call the right publishing.* function,
        return its {inventory_recipe_id, published_at, warnings} dict."""
        raise NotImplementedError

    def _log_published(self, recipe, request):
        """Override per recipe type: write an activity-log entry."""
        raise NotImplementedError

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """Push this recipe to inventory-platform (POST first time, PATCH
        after). Ingredient/unit mismatches come back as `warnings`, not
        failures; a hard failure is a 502 with the platform's message."""
        recipe = self.get_object()
        try:
            result = self._publish_to_inventory(recipe)
        except RecipePublishError as e:
            return Response({'detail': str(e)}, status=502)
        self._log_published(recipe, request)
        detail = self.detail_serializer_class(recipe).data
        detail['_publish'] = result
        return Response(detail)

    # ── version history ──────────────────────────────────────────────────
    def _lineage(self, recipe):
        """Every version row for this recipe, oldest first. Archived rows are
        reachable here because get_queryset() only hides them for `list`."""
        model = type(recipe)
        return list(
            model.objects
            .filter(lineage_key=recipe.lineage_key)
            .prefetch_related('ingredients__unit', 'steps')
            .order_by('version', 'created_at')
        )

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        recipe = self.get_object()
        rows = self._lineage(recipe)
        out = []
        for i, row in enumerate(rows):
            entry = {
                'id': str(row.id),
                'version': row.version,
                'is_current': row.is_current,
                'is_viewed': str(row.id) == str(recipe.id),
                'revision': row.revision,
                'revision_date': row.revision_date,
                'cost': str(row.cost),
                'selling_price': str(row.selling_price) if getattr(row, 'selling_price', None) is not None else None,
                'output_qty': str(row.output_qty) if getattr(row, 'output_qty', None) is not None else None,
                'created_at': row.created_at,
                'updated_at': row.updated_at,
                'changes_from_previous': diff_summary(rows[i - 1], row) if i else None,
            }
            out.append(entry)
        return Response({'lineage_key': str(recipe.lineage_key), 'versions': out})

    @action(detail=True, methods=['get'])
    def diff(self, request, pk=None):
        recipe = self.get_object()
        rows = {str(r.id): r for r in self._lineage(recipe)}
        if len(rows) < 2:
            raise ValidationError('This recipe has only one version.')

        ordered = sorted(rows.values(), key=lambda r: (r.version, r.created_at))
        b_id = request.query_params.get('b') or str(ordered[-1].id)
        a_id = request.query_params.get('a') or (
            str(ordered[ordered.index(rows[b_id]) - 1].id) if b_id in rows and ordered.index(rows[b_id]) > 0
            else str(ordered[0].id)
        )
        if a_id not in rows or b_id not in rows:
            raise NotFound('Both versions must belong to this recipe.')

        a, b = rows[a_id], rows[b_id]
        older, newer = sorted((a, b), key=lambda r: (r.version, r.created_at))
        return Response({
            'from': {'id': str(older.id), 'version': older.version},
            'to': {'id': str(newer.id), 'version': newer.version},
            **diff_recipes(older, newer),
        })


class DishRecipeViewSet(ScopedQuerySetMixin, RecipeViewSetBase):
    scope_kind = 'branch'
    scope_field = 'branch_ref_id'
    permission_classes = [capability_required(default='dish.view', by_action={
        'list': 'dish.view', 'retrieve': 'dish.view',
        'create': 'dish.edit', 'update': 'dish.edit', 'partial_update': 'dish.edit',
        'destroy': 'dish.delete',
        'recalculate': 'costing.recalculate',
        'versions': 'recipe.history', 'diff': 'recipe.history',
        'publish': 'recipe.publish',
    })]
    queryset = DishRecipe.objects.select_related(
        'category', 'section', 'service_style', 'approved_by', 'qa_approved_by', 'branch_ref',
    ).prefetch_related('ingredients__unit', 'steps', 'allergens', 'standard', 'price_history', 'activity_log')
    detail_serializer_class = DishRecipeDetailSerializer

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return DishRecipeWriteSerializer
        if self.action == 'retrieve':
            return DishRecipeDetailSerializer
        return DishRecipeListSerializer

    def _snapshot_and_log_recalculate(self, recipe, request):
        DishPriceHistory.objects.create(dish_recipe=recipe, cost=recipe.cost, selling_price=recipe.selling_price)
        DishRecipeActivityLog.objects.create(
            recipe=recipe, action_type=ActivityActionType.RECALCULATED, changed_by=request.user.username,
        )

    def _publish_to_inventory(self, recipe):
        return publish_dish_recipe(recipe)

    def _log_published(self, recipe, request):
        DishRecipeActivityLog.objects.create(
            recipe=recipe, action_type=ActivityActionType.PUBLISHED, changed_by=request.user.username,
            description=f'Pushed to inventory-platform (#{recipe.inventory_recipe_id})',
        )


class ProductionRecipeViewSet(ScopedQuerySetMixin, RecipeViewSetBase):
    scope_kind = 'prep_kitchen'
    scope_field = 'prep_kitchen_ref_id'
    permission_classes = [capability_required(default='production.view', by_action={
        'list': 'production.view', 'retrieve': 'production.view',
        'create': 'production.edit', 'update': 'production.edit', 'partial_update': 'production.edit',
        'destroy': 'production.delete',
        'recalculate': 'costing.recalculate',
        'versions': 'recipe.history', 'diff': 'recipe.history',
        'publish': 'recipe.publish',
    })]
    queryset = ProductionRecipe.objects.select_related(
        'section', 'approved_by', 'qa_approved_by', 'output_unit', 'prep_kitchen_ref',
    ).prefetch_related('ingredients__unit', 'steps', 'cost_history', 'activity_log')
    detail_serializer_class = ProductionRecipeDetailSerializer

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProductionRecipeWriteSerializer
        if self.action == 'retrieve':
            return ProductionRecipeDetailSerializer
        return ProductionRecipeListSerializer

    def _snapshot_and_log_recalculate(self, recipe, request):
        ProductionCostHistory.objects.create(production_recipe=recipe, cost=recipe.cost, output_qty=recipe.output_qty)
        ProductionRecipeActivityLog.objects.create(
            recipe=recipe, action_type=ActivityActionType.RECALCULATED, changed_by=request.user.username,
        )

    def _publish_to_inventory(self, recipe):
        return publish_production_recipe(recipe)

    def _log_published(self, recipe, request):
        ProductionRecipeActivityLog.objects.create(
            recipe=recipe, action_type=ActivityActionType.PUBLISHED, changed_by=request.user.username,
            description=f'Pushed to inventory-platform (#{recipe.inventory_recipe_id})',
        )


class ItemConversionViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    """Looked up by item_sku directly (unique on the model) rather than a
    UUID — GET/PATCH/DELETE /api/cookbook/item-conversions/<SKU>/."""
    permission_classes = [IsAuthenticated]
    queryset = ItemConversion.objects.prefetch_related('lines__unit').select_related('updated_by', 'approved_by')
    serializer_class = ItemConversionSerializer
    lookup_field = 'item_sku'
    lookup_value_regex = '[^/]+'


class ItemNutritionViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    """Looked up by item_sku directly — GET/PATCH/DELETE /api/cookbook/item-nutrition/<SKU>/."""
    permission_classes = [IsAuthenticated]
    queryset = ItemNutrition.objects.select_related('unit_scale', 'updated_by', 'approved_by')
    serializer_class = ItemNutritionSerializer
    lookup_field = 'item_sku'
    lookup_value_regex = '[^/]+'
