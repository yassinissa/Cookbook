from django.contrib.auth import get_user_model
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.cookbook.audit import AuditedViewSetMixin, object_state, record
from apps.cookbook.models import ActivityActionType, ActivityArea

from .permissions import capability_required
from .models import Capability, Role
from .serializers import (
    CapabilitySerializer, RoleSerializer, UserSerializer, capability_catalogue,
)

User = get_user_model()


class CapabilityViewSet(viewsets.ReadOnlyModelViewSet):
    """The catalogue — read-only. `?grouped=1` returns it grouped for checklists."""
    permission_classes = [capability_required(default='admin.roles')]
    queryset = Capability.objects.all()
    serializer_class = CapabilitySerializer
    pagination_class = None

    def list(self, request, *args, **kwargs):
        if request.query_params.get('grouped') == '1':
            return Response(capability_catalogue())
        return super().list(request, *args, **kwargs)


def _code_list(qs):
    return ', '.join(sorted(c.code for c in qs.all())) or None


class RoleViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [capability_required(default='admin.roles')]
    queryset = Role.objects.prefetch_related(
        'capabilities', 'default_branches', 'default_prep_kitchens')
    serializer_class = RoleSerializer
    pagination_class = None
    audit_area, audit_subject, audit_prefix = ActivityArea.ADMIN, 'role', 'role'

    def audit_subject_fields(self, obj):
        return {'label': obj.name, 'path': '/admin/roles'}

    def audit_state(self, obj):
        # capabilities by code, not label — that's what an auditor greps for
        return {**object_state(obj, skip=('capabilities',)), 'capabilities': _code_list(obj.capabilities)}

    def perform_destroy(self, instance):
        if instance.is_system:
            raise PermissionDenied('Built-in roles cannot be deleted.')
        if instance.members.exists():
            raise PermissionDenied('Reassign this role’s users before deleting it.')
        super().perform_destroy(instance)


def _user_state(user):
    profile = getattr(user, 'profile', None)
    state = {
        'username': user.username, 'email': user.email or None,
        'is_active': 'Yes' if user.is_active else 'No',
        'is_superuser': 'Yes' if user.is_superuser else 'No',
    }
    if profile is not None:
        state.update({
            'display_name': profile.display_name or None,
            'role': profile.role.name if profile.role_id else None,
            'scope_overridden': 'Yes' if profile.scope_overridden else 'No',
            'branches': ', '.join(sorted(b.name_en for b in profile.branches.all())) or None,
            'prep_kitchens': ', '.join(sorted(k.name_en for k in profile.prep_kitchens.all())) or None,
            'extra_capabilities': _code_list(profile.extra_capabilities),
            'denied_capabilities': _code_list(profile.denied_capabilities),
        })
    return state


class UserViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_area, audit_subject, audit_prefix = ActivityArea.ADMIN, 'user', 'user'

    def audit_subject_fields(self, obj):
        return {'label': getattr(getattr(obj, 'profile', None), 'display_name', '') or obj.username,
                'code': obj.username, 'path': '/admin/users'}

    def audit_state(self, obj):
        return _user_state(obj)

    def _audit(self, action, obj, before, after, description=''):
        # never the password itself, only that it was set
        if action != ActivityActionType.DELETED and (getattr(self.request, 'data', None) or {}).get('password'):
            after = {**after, 'password': 'set' if action == ActivityActionType.CREATED else 'changed'}
        super()._audit(action, obj, before, after, description)

    def _toggle(self, user, active):
        before = _user_state(user)
        user.is_active = active
        user.profile.is_active = active
        user.save(update_fields=['is_active'])
        user.profile.save(update_fields=['is_active'])
        record(self.request, area=ActivityArea.ADMIN,
               action=ActivityActionType.ACTIVATED if active else ActivityActionType.DEACTIVATED,
               subject_type='user', subject_id=user.pk,
               changes={'fields': [{'field': 'user.is_active', 'from': before['is_active'],
                                    'to': 'Yes' if active else 'No'}]},
               **self.audit_subject_fields(user))
        return Response(self.get_serializer(user).data)

    permission_classes = [capability_required(default='admin.users')]
    queryset = User.objects.select_related('profile__role').prefetch_related(
        'profile__branches', 'profile__prep_kitchens',
        'profile__extra_capabilities', 'profile__denied_capabilities',
        'profile__role__capabilities',
    ).order_by('username')
    serializer_class = UserSerializer
    pagination_class = None

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        return self._toggle(self.get_object(), False)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        return self._toggle(self.get_object(), True)
