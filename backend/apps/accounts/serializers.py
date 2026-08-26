from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from apps.cookbook.models import Branch, PrepKitchen

from .access import ALL, access_for
from .capabilities import CAPABILITY_GROUPS
from .models import Capability, Role, UserProfile

User = get_user_model()


class CapabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Capability
        fields = ['id', 'code', 'label', 'group', 'description']


class RoleSerializer(serializers.ModelSerializer):
    capability_codes = serializers.SlugRelatedField(
        source='capabilities', slug_field='code', many=True, queryset=Capability.objects.all(),
        required=False)
    default_branch_ids = serializers.PrimaryKeyRelatedField(
        source='default_branches', many=True, queryset=Branch.objects.all(), required=False)
    default_prep_kitchen_ids = serializers.PrimaryKeyRelatedField(
        source='default_prep_kitchens', many=True, queryset=PrepKitchen.objects.all(), required=False)
    member_count = serializers.IntegerField(source='members.count', read_only=True)

    class Meta:
        model = Role
        fields = [
            'id', 'name', 'description', 'is_system',
            'capability_codes', 'grants_all_branches', 'grants_all_prep_kitchens',
            'default_branch_ids', 'default_prep_kitchen_ids', 'member_count',
        ]
        read_only_fields = ['is_system']


class _ScopeField(serializers.Serializer):
    branches = serializers.SerializerMethodField()
    prep_kitchens = serializers.SerializerMethodField()

    def _fmt(self, id_set):
        if id_set is ALL:
            return 'all'
        return list(id_set)

    def get_branches(self, obj):
        return self._fmt(obj.branch_ids)

    def get_prep_kitchens(self, obj):
        return self._fmt(obj.prep_kitchen_ids)


class UserSerializer(serializers.ModelSerializer):
    """Full read/write of a user + their profile for the admin UI."""
    profile_id      = serializers.UUIDField(source='profile.id', read_only=True)
    display_name    = serializers.CharField(source='profile.display_name', required=False, allow_blank=True)
    role_id         = serializers.PrimaryKeyRelatedField(
        source='profile.role', queryset=Role.objects.all(), allow_null=True, required=False)
    role_name       = serializers.CharField(source='profile.role.name', read_only=True, default=None)
    is_membership_active = serializers.BooleanField(source='profile.is_active', required=False)
    scope_overridden = serializers.BooleanField(source='profile.scope_overridden', required=False)
    branch_ids      = serializers.PrimaryKeyRelatedField(
        source='profile.branches', many=True, queryset=Branch.objects.all(), required=False)
    prep_kitchen_ids = serializers.PrimaryKeyRelatedField(
        source='profile.prep_kitchens', many=True, queryset=PrepKitchen.objects.all(), required=False)
    extra_capability_codes = serializers.SlugRelatedField(
        source='profile.extra_capabilities', slug_field='code', many=True,
        queryset=Capability.objects.all(), required=False)
    denied_capability_codes = serializers.SlugRelatedField(
        source='profile.denied_capabilities', slug_field='code', many=True,
        queryset=Capability.objects.all(), required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    effective_capabilities = serializers.SerializerMethodField()
    effective_scope        = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'is_active', 'is_superuser',
            'profile_id', 'display_name', 'role_id', 'role_name',
            'is_membership_active', 'scope_overridden', 'branch_ids', 'prep_kitchen_ids',
            'extra_capability_codes', 'denied_capability_codes', 'password',
            'effective_capabilities', 'effective_scope',
        ]
        read_only_fields = ['is_superuser']

    def get_effective_capabilities(self, obj):
        return sorted(access_for(obj).capabilities)

    def get_effective_scope(self, obj):
        return _ScopeField(access_for(obj).scope).data

    # ── writes ──────────────────────────────────────────────────────────
    def _apply_profile(self, profile, data):
        simple = ('display_name', 'is_active', 'scope_overridden')
        for k in simple:
            if k in data:
                setattr(profile, k, data[k])
        if 'role' in data:
            profile.role = data['role']
        profile.save()
        for m2m in ('branches', 'prep_kitchens', 'extra_capabilities', 'denied_capabilities'):
            if m2m in data:
                getattr(profile, m2m).set(data[m2m])

    @transaction.atomic
    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        password = validated_data.pop('password', '') or None
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        self._apply_profile(user.profile, profile_data)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        password = validated_data.pop('password', '')
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        self._apply_profile(instance.profile, profile_data)
        return instance


def capability_catalogue():
    """Grouped catalogue for the admin checklist UI."""
    rows = list(Capability.objects.all())
    return [
        {'group': g, 'capabilities': CapabilitySerializer(
            [c for c in rows if c.group == g], many=True).data}
        for g in CAPABILITY_GROUPS
    ]
