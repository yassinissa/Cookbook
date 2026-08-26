from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.cookbook.models import PrepKitchen

from .models import Capability, Role, UserProfile

User = get_user_model()


@admin.register(Capability)
class CapabilityAdmin(admin.ModelAdmin):
    list_display = ('code', 'label', 'group')
    list_filter = ('group',)
    search_fields = ('code', 'label')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_system', 'grants_all_branches', 'grants_all_prep_kitchens')
    list_filter = ('is_system',)
    filter_horizontal = ('capabilities', 'default_branches', 'default_prep_kitchens')
    search_fields = ('name',)


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    filter_horizontal = ('branches', 'prep_kitchens', 'extra_capabilities', 'denied_capabilities')
    fields = (
        'display_name', 'role', 'is_active',
        'scope_overridden', 'branches', 'prep_kitchens',
        'extra_capabilities', 'denied_capabilities',
    )


class UserAdmin(BaseUserAdmin):
    inlines = [UserProfileInline]
    list_display = BaseUserAdmin.list_display + ('cookbook_role',)

    @admin.display(description='Cookbook role')
    def cookbook_role(self, obj):
        return getattr(getattr(obj, 'profile', None), 'role', None)


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(PrepKitchen)
class PrepKitchenAdmin(admin.ModelAdmin):
    list_display = ('name_en', 'name_ar', 'code', 'sort_order', 'inventory_store_id')
    ordering = ('sort_order', 'name_en')
