from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.access import ALL, access_for
from apps.cookbook.models import Branch, PrepKitchen


class ThrottledLoginView(TokenObtainPairView):
    """JWT login, rate-limited per client IP (scope 'login', default 10/min) so
    the password endpoint can't be brute-forced. Everything else relies on the
    global anon/user throttles."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    # Sign-ins are audited through Django's standard auth signals (the
    # cookbook app listens): a wrong password already fires
    # `user_login_failed` inside authenticate(); a success and a rate-limit
    # block are announced here. Never the password.
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0]) from e
        user_logged_in.send(sender=serializer.user.__class__, request=request, user=serializer.user)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)

    def throttled(self, request, wait):
        user_login_failed.send(
            sender=__name__, request=request, reason='rate_limited',
            credentials={'username': (request.data or {}).get('username', '')},
        )
        super().throttled(request, wait)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """Sign out. JWTs live in the browser, so the app drops its own tokens;
    this call exists so the sign-out is announced (Django's `user_logged_out`
    signal — the cookbook action log listens)."""
    user_logged_out.send(sender=request.user.__class__, request=request, user=request.user)
    return Response(status=status.HTTP_204_NO_CONTENT)


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
