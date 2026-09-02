"""
POS modifier API.

  /api/cookbook/modifier-groups/     the global group + option catalogue
  /api/cookbook/dish-modifiers/      which groups hang off a dish — addressed
                                     by dish id, same shape as plating-guides /
                                     dish-standards

Both gated `pos.manage`. Attaching a modifier never versions the recipe and
never re-runs costing.
"""
from rest_framework import mixins, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import ScopedQuerySetMixin, capability_required

from .models import DishRecipe, ModifierGroup
from .serializers.modifiers import (
    ModifierGroupSerializer, ModifierGroupWriteSerializer,
    DishModifierListSerializer, DishModifierDetailSerializer, DishModifierWriteSerializer,
)


class ModifierGroupViewSet(viewsets.ModelViewSet):
    permission_classes = [capability_required(default='pos.manage')]
    pagination_class = None
    queryset = (ModifierGroup.objects
                .prefetch_related('options', 'options__unit', 'options__variant_recipe', 'dish_uses')
                .order_by('name_en'))

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ModifierGroupWriteSerializer
        return ModifierGroupSerializer


class DishModifierViewSet(
    ScopedQuerySetMixin,
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    scope_kind = 'branch'
    scope_field = 'branch_ref_id'
    permission_classes = [capability_required(default='pos.manage')]
    pagination_class = None
    queryset = (DishRecipe.objects.filter(is_current=True)
                .select_related('category', 'branch_ref')
                .prefetch_related('modifier_groups__group__options')
                .order_by('name_en'))

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DishModifierDetailSerializer
        return DishModifierListSerializer

    def update(self, request, *args, **kwargs):
        dish = self.get_object()
        writer = DishModifierWriteSerializer(data=request.data)
        writer.is_valid(raise_exception=True)
        writer.save(dish=dish)
        dish.refresh_from_db()
        out = DishModifierDetailSerializer(dish, context=self.get_serializer_context())
        return Response(out.data)
