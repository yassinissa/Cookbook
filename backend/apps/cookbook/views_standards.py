"""
Standalone QA/QC standards API — `/api/cookbook/dish-standards/`.

Addressed by dish id: the list is one row per *current* DishRecipe (so QA
sees the gaps), retrieve/patch/approve operate on that dish's OneToOne
DishStandard. A standard edit here is deliberately NOT a recipe edit — it
never bumps the recipe version or re-runs costing.
"""
from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import ScopedQuerySetMixin, capability_required

from .models import (
    Approver, DishRecipe, DishStandard, DishRecipeActivityLog, ActivityActionType,
)
from .serializers.standards import (
    DishStandardListSerializer, DishStandardDetailSerializer, DishStandardWriteSerializer,
)


class DishStandardViewSet(
    ScopedQuerySetMixin,
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    scope_kind = 'branch'
    scope_field = 'branch_ref_id'
    permission_classes = [capability_required(default='standard.view', by_action={
        'list': 'standard.view', 'retrieve': 'standard.view',
        'update': 'standard.edit', 'partial_update': 'standard.edit',
        'approve': 'standard.edit',
    })]
    queryset = (
        DishRecipe.objects.filter(is_current=True)
        .select_related('category', 'section', 'branch_ref', 'standard', 'standard__qa_approved_by')
        .order_by('name_en')
    )

    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return DishStandardWriteSerializer
        if self.action == 'retrieve':
            return DishStandardDetailSerializer
        return DishStandardListSerializer

    def _changed_by(self):
        return getattr(getattr(self.request, 'user', None), 'username', '') or ''

    def _log(self, dish, action_type, description=''):
        DishRecipeActivityLog.objects.create(
            recipe=dish, action_type=action_type, description=description,
            changed_by=self._changed_by(),
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        dish = self.get_object()
        existing = getattr(dish, 'standard', None)
        serializer = self.get_serializer(existing, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        std = serializer.save(dish_recipe=dish)

        created = existing is None
        self._log(
            dish, ActivityActionType.STANDARD_UPDATED,
            'QA standard created' if created else 'QA standard revised',
        )
        dish.refresh_from_db()
        out = DishStandardDetailSerializer(dish, context=self.get_serializer_context())
        return Response(out.data, status=201 if created else 200)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Sign off the standard. Body: {"qa_approved_by": "<approver id>"}.
        Pass qa_approved_by=null to clear the approval."""
        dish = self.get_object()
        std = getattr(dish, 'standard', None)
        if std is None:
            raise ValidationError('This dish has no standard to approve yet.')

        approver_id = request.data.get('qa_approved_by', 'MISSING')
        if approver_id in (None, ''):
            std.qa_approved_by = None
            std.approval_date = None
            std.save(update_fields=['qa_approved_by', 'approval_date', 'updated_at'])
            self._log(dish, ActivityActionType.STANDARD_UPDATED, 'QA approval cleared')
        else:
            if approver_id == 'MISSING':
                raise ValidationError({'qa_approved_by': 'This field is required.'})
            approver = get_object_or_404(Approver, pk=approver_id)
            std.qa_approved_by = approver
            std.approval_date = date.today()
            std.save(update_fields=['qa_approved_by', 'approval_date', 'updated_at'])
            self._log(
                dish, ActivityActionType.STANDARD_APPROVED,
                f'Approved by {approver.name}',
            )

        dish.refresh_from_db()
        out = DishStandardDetailSerializer(dish, context=self.get_serializer_context())
        return Response(out.data)
