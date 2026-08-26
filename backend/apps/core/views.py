from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.access import ALL, access_for
from apps.cookbook.models import Branch, PrepKitchen


def _scope_payload(id_set, model):
    if id_set is ALL:
        return 'all'
    if not id_set:
        return []
    rows = model.objects.filter(id__in=list(id_set))
    return [{'id': str(r.id), 'name_en': r.name_en, 'name_ar': r.name_ar} for r in rows]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    access = access_for(request)
    profile = getattr(user, 'profile', None)
    role = access.role

    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'display_name': (profile.display_name if profile and profile.display_name
                         else (user.get_full_name() or user.username)),
        'is_superuser': user.is_superuser,
        'is_staff': user.is_staff,
        'role': {'id': str(role.id), 'name': role.name} if role else None,
        'capabilities': sorted(access.capabilities),
        'scope': {
            'branches': _scope_payload(access.scope.branch_ids, Branch),
            'prep_kitchens': _scope_payload(access.scope.prep_kitchen_ids, PrepKitchen),
        },
    })
