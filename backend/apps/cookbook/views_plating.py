"""
Standalone plating-guide API — `/api/cookbook/plating-guides/`.

Addressed by dish id, same shape as the QA-standards API: the list is one row
per *current* DishRecipe (so a chef sees the gaps), retrieve / patch operate
on that dish's OneToOne PlatingGuide. A plating edit is deliberately NOT a
recipe edit — it never bumps the recipe version or re-runs costing.
"""
from rest_framework import mixins, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import ScopedQuerySetMixin, capability_required

from .models import DishRecipe, DishRecipeActivityLog, ActivityActionType
from .serializers.plating import (
    PlatingGuideListSerializer, PlatingGuideDetailSerializer, PlatingGuideWriteSerializer,
)


class PlatingGuideViewSet(
    ScopedQuerySetMixin,
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    scope_kind = 'branch'
    scope_field = 'branch_ref_id'
    permission_classes = [capability_required(default='standard.view', by_action={
        'list': 'standard.view', 'retrieve': 'standard.view',
        'update': 'standard.edit', 'partial_update': 'standard.edit',
    })]
    queryset = (
        DishRecipe.objects.filter(is_current=True)
        .select_related('category', 'section', 'branch_ref', 'plating',
                        'plating__updated_by', 'plating__approved_by')
        .prefetch_related('plating__images')
        .order_by('name_en')
    )

    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return PlatingGuideWriteSerializer
        if self.action == 'retrieve':
            return PlatingGuideDetailSerializer
        return PlatingGuideListSerializer

    def _changed_by(self):
        return getattr(getattr(self.request, 'user', None), 'username', '') or ''

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        dish = self.get_object()
        existing = getattr(dish, 'plating', None)
        serializer = self.get_serializer(existing, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(dish_recipe=dish)

        created = existing is None
        DishRecipeActivityLog.objects.create(
            recipe=dish, action_type=ActivityActionType.PLATING_UPDATED,
            description='Plating guide created' if created else 'Plating guide revised',
            changed_by=self._changed_by(),
        )
        dish.refresh_from_db()
        out = PlatingGuideDetailSerializer(dish, context=self.get_serializer_context())
        return Response(out.data, status=201 if created else 200)
