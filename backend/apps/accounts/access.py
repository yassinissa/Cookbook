"""
The access resolver — the one place that turns a User into an effective set of
capabilities and a data scope. Used by the DRF permission classes, the
`/api/auth/me/` view and the admin API.

Results are memoised on the request object (`_access_cache`) so a viewset that
checks a capability and then filters a queryset only resolves once.
"""
from dataclasses import dataclass, field

from .capabilities import CAPABILITY_CODES
from .models import UserProfile

ALL = '__all__'   # sentinel: scope is unrestricted on this dimension


@dataclass
class Scope:
    branch_ids: object = field(default_factory=set)        # set[str] | ALL
    prep_kitchen_ids: object = field(default_factory=set)  # set[str] | ALL

    def allows_branch(self, branch_id):
        return self.branch_ids is ALL or (branch_id is not None and str(branch_id) in self.branch_ids)

    def allows_prep_kitchen(self, pk_id):
        return self.prep_kitchen_ids is ALL or (pk_id is not None and str(pk_id) in self.prep_kitchen_ids)


@dataclass
class Access:
    capabilities: set
    scope: Scope
    is_superuser: bool
    profile: object = None
    role: object = None

    def can(self, code):
        return self.is_superuser or code in self.capabilities


def _profile(user):
    try:
        return user.profile
    except UserProfile.DoesNotExist:
        return UserProfile.objects.create(user=user)


def _resolve(user):
    if not user or not user.is_authenticated:
        return Access(capabilities=set(), scope=Scope(), is_superuser=False)

    if user.is_superuser:
        return Access(
            capabilities=set(CAPABILITY_CODES),
            scope=Scope(branch_ids=ALL, prep_kitchen_ids=ALL),
            is_superuser=True,
            profile=getattr(user, 'profile', None),
        )

    profile = _profile(user)
    role = profile.role

    if not profile.is_active:
        return Access(capabilities=set(), scope=Scope(), is_superuser=False, profile=profile, role=role)

    caps = set()
    if role:
        caps |= set(role.capabilities.values_list('code', flat=True))
    caps |= set(profile.extra_capabilities.values_list('code', flat=True))
    caps -= set(profile.denied_capabilities.values_list('code', flat=True))

    if profile.scope_overridden or role is None:
        branch_ids = {str(x) for x in profile.branches.values_list('id', flat=True)}
        pk_ids = {str(x) for x in profile.prep_kitchens.values_list('id', flat=True)}
    else:
        branch_ids = (ALL if role.grants_all_branches
                      else {str(x) for x in role.default_branches.values_list('id', flat=True)})
        pk_ids = (ALL if role.grants_all_prep_kitchens
                  else {str(x) for x in role.default_prep_kitchens.values_list('id', flat=True)})

    return Access(
        capabilities=caps,
        scope=Scope(branch_ids=branch_ids, prep_kitchen_ids=pk_ids),
        is_superuser=False,
        profile=profile,
        role=role,
    )


def access_for(request_or_user):
    """Access for a DRF request (memoised) or a bare User."""
    if hasattr(request_or_user, 'user'):   # a request
        request = request_or_user
        cached = getattr(request, '_access_cache', None)
        if cached is None:
            cached = _resolve(request.user)
            request._access_cache = cached
        return cached
    return _resolve(request_or_user)


def effective_capabilities(user):
    return access_for(user).capabilities


def effective_scope(user):
    return access_for(user).scope
