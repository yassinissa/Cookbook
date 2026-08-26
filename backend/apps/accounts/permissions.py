"""
DRF enforcement primitives.

  permission_classes = [capability_required('dish.view')]
  permission_classes = [capability_required(by_action={
      'list': 'dish.view', 'retrieve': 'dish.view',
      'create': 'dish.edit', 'update': 'dish.edit', 'partial_update': 'dish.edit',
      'destroy': 'dish.delete',
  }, default='dish.view')]

  ScopedQuerySetMixin — on a ViewSet, filters every queryset to the requesting
  user's data scope (branch or prep kitchen). Set `scope_kind` + `scope_field`.
"""
from rest_framework.permissions import BasePermission

from .access import ALL, access_for


def capability_required(default=None, by_action=None):
    """Return a DRF permission class enforcing a capability (per-action if
    given). Superusers always pass; an unmapped action with no default falls
    back to 'must be authenticated'."""
    by_action = by_action or {}

    class _CapabilityPermission(BasePermission):
        message = 'You do not have permission to use this feature.'

        def has_permission(self, request, view):
            access = access_for(request)
            if access.is_superuser:
                return True
            required = by_action.get(getattr(view, 'action', None), default)
            if required is None:
                return bool(request.user and request.user.is_authenticated)
            return access.can(required)

        def has_object_permission(self, request, view, obj):
            return self.has_permission(request, view)

    return _CapabilityPermission


class ScopedQuerySetMixin:
    """
    Restrict list/detail to the user's data scope.

    scope_kind:  "branch" | "prep_kitchen"
    scope_field: the FK id field to filter on, e.g. "branch_ref_id"
    """
    scope_kind = None
    scope_field = None

    def get_queryset(self):
        qs = super().get_queryset()
        access = access_for(self.request)
        if access.is_superuser or self.scope_kind is None:
            return qs

        ids = (access.scope.branch_ids if self.scope_kind == 'branch'
               else access.scope.prep_kitchen_ids)
        if ids is ALL:
            return qs
        if not ids:
            return qs.none()
        return qs.filter(**{f'{self.scope_field}__in': list(ids)})
