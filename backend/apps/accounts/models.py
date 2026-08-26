"""
Role-based access: a capability catalogue, roles that bundle capabilities with
a default data scope, and a per-user profile that assigns a role and can
override the scope / grant / deny individual capabilities.

Enforcement is in apps.accounts.permissions + .access — nothing here does
checks, these are just the records.
"""
from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class Capability(BaseModel):
    """One named permission. Rows mirror apps.accounts.capabilities.CAPABILITIES
    and are kept in sync by `manage.py sync_capabilities`."""
    code        = models.CharField(max_length=50, unique=True)
    label       = models.CharField(max_length=150)
    group       = models.CharField(max_length=50)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ['group', 'label']
        verbose_name_plural = 'capabilities'

    def __str__(self):
        return self.code


class Role(BaseModel):
    """A named bundle of capabilities plus a default data scope. `is_system`
    roles are seeded and protected from deletion."""
    name         = models.CharField(max_length=80, unique=True)
    description  = models.TextField(blank=True)
    capabilities = models.ManyToManyField(Capability, blank=True, related_name='roles')

    grants_all_branches      = models.BooleanField(default=False)
    grants_all_prep_kitchens = models.BooleanField(default=False)
    default_branches = models.ManyToManyField(
        'cookbook.Branch', blank=True, related_name='default_for_roles')
    default_prep_kitchens = models.ManyToManyField(
        'cookbook.PrepKitchen', blank=True, related_name='default_for_roles')

    is_system = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class UserProfile(BaseModel):
    """Extends the Django User with a role, a data scope and per-user
    capability adjustments. Created automatically for every User (signals.py)."""
    user         = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                        related_name='profile')
    display_name = models.CharField(max_length=150, blank=True)
    role         = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='members')

    # scope: when scope_overridden the profile M2Ms win; otherwise the role's
    # defaults apply.
    scope_overridden = models.BooleanField(default=False)
    branches      = models.ManyToManyField('cookbook.Branch', blank=True, related_name='scoped_users')
    prep_kitchens = models.ManyToManyField('cookbook.PrepKitchen', blank=True, related_name='scoped_users')

    # per-user capability adjustments, applied on top of the role
    extra_capabilities  = models.ManyToManyField(Capability, blank=True, related_name='granted_to')
    denied_capabilities = models.ManyToManyField(Capability, blank=True, related_name='denied_to')

    is_active = models.BooleanField(default=True, help_text='Deactivate to block sign-in access.')

    class Meta:
        ordering = ['user__username']

    def __str__(self):
        return self.display_name or self.user.get_username()
