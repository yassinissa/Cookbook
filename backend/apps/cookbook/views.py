from rest_framework import viewsets, mixins
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import (
    MenuCategory, Branch, Section, Approver, Allergen, ServiceStyle, UnitScale,
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
from .services import calculate_recipe_cost


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

    def _response_with_warnings(self, instance, status_code=200):
        detail = self.detail_serializer_class(instance).data
        unknown_skus = getattr(instance, '_unknown_skus', [])
        if unknown_skus:
            detail['_warnings'] = [f'Unknown item SKU (cost not included): {sku}' for sku in unknown_skus]
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
        """Re-fetch live item costs and persist the total (see services.calculate_recipe_cost)."""
        recipe = self.get_object()
        cost, unknown_skus = calculate_recipe_cost(recipe.ingredients.all())
        recipe.cost = cost
        recipe.save(update_fields=['cost'])
        self._snapshot_and_log_recalculate(recipe, request)
        data = {'cost': cost}
        if unknown_skus:
            data['_warnings'] = [f'Unknown item SKU: {sku}' for sku in unknown_skus]
        return Response(data)


class DishRecipeViewSet(RecipeViewSetBase):
    queryset = DishRecipe.objects.select_related(
        'category', 'section', 'service_style', 'approved_by', 'qa_approved_by',
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


class ProductionRecipeViewSet(RecipeViewSetBase):
    queryset = ProductionRecipe.objects.select_related(
        'section', 'approved_by', 'qa_approved_by', 'output_unit',
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
