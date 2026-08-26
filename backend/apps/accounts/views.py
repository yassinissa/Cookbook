from django.contrib.auth import get_user_model
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

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


class RoleViewSet(viewsets.ModelViewSet):
    permission_classes = [capability_required(default='admin.roles')]
    queryset = Role.objects.prefetch_related(
        'capabilities', 'default_branches', 'default_prep_kitchens')
    serializer_class = RoleSerializer
    pagination_class = None

    def perform_destroy(self, instance):
        if instance.is_system:
            raise PermissionDenied('Built-in roles cannot be deleted.')
        if instance.members.exists():
            raise PermissionDenied('Reassign this role’s users before deleting it.')
        instance.delete()


class UserViewSet(viewsets.ModelViewSet):
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
        user = self.get_object()
        user.is_active = False
        user.profile.is_active = False
        user.save(update_fields=['is_active'])
        user.profile.save(update_fields=['is_active'])
        return Response(self.get_serializer(user).data)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.profile.is_active = True
        user.save(update_fields=['is_active'])
        user.profile.save(update_fields=['is_active'])
        return Response(self.get_serializer(user).data)
