from rest_framework import viewsets, mixins
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import (
    MenuCategory, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor, DishRecipe,
)
from .serializers import (
    MenuCategorySerializer, SectionSerializer, ApproverSerializer,
    AllergenSerializer, ServiceStyleSerializer, UnitScaleSerializer,
    StandardMeasurementConversionSerializer, TasteDescriptorSerializer,
    DishRecipeListSerializer, DishRecipeDetailSerializer, DishRecipeWriteSerializer,
)
from .services import calculate_recipe_cost


class ReadOnlyReferenceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Reference data is seeded/edited via Django admin, not this API."""
    permission_classes = [IsAuthenticated]
    pagination_class = None


class MenuCategoryViewSet(ReadOnlyReferenceViewSet):
    queryset = MenuCategory.objects.all()
    serializer_class = MenuCategorySerializer


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


class DishRecipeViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    queryset = DishRecipe.objects.select_related(
        'category', 'section', 'service_style', 'approved_by', 'qa_approved_by',
    ).prefetch_related('ingredients__unit', 'steps', 'allergens', 'standard')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return DishRecipeWriteSerializer
        if self.action == 'retrieve':
            return DishRecipeDetailSerializer
        return DishRecipeListSerializer

    def _response_with_warnings(self, instance, status_code=200):
        detail = DishRecipeDetailSerializer(instance).data
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

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """Re-fetch live item costs and persist the total (see services.calculate_recipe_cost)."""
        recipe = self.get_object()
        cost, unknown_skus = calculate_recipe_cost(recipe.ingredients.all())
        recipe.cost = cost
        recipe.save(update_fields=['cost'])
        data = {'cost': cost}
        if unknown_skus:
            data['_warnings'] = [f'Unknown item SKU: {sku}' for sku in unknown_skus]
        return Response(data)
