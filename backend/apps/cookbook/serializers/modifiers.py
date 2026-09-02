"""
POS modifier serializers.

`ModifierGroupWriteSerializer` takes nested `options` reconciled by id — an
entry with an `id` is updated, one without is created, any existing option
absent from the payload is deleted. Same shape as the plating photos and the
menu-period lines.

`DishModifierSerializer` is addressed by *dish id* (like the plating guide /
QA standard): the list is one row per current DishRecipe so a chef sees which
dishes have no modifiers, and the write upserts that dish's `DishModifierGroup`
set without versioning the recipe.
"""
from rest_framework import serializers

from apps.cookbook.models import (
    DishRecipe, ModifierGroup, ModifierOption, ModifierOptionKind, ModifierRole,
    DishModifierGroup,
)

_ADDON_FIELDS = ('item_sku', 'quantity', 'unit')


class ModifierOptionSerializer(serializers.ModelSerializer):
    id           = serializers.UUIDField(required=False)
    unit_code    = serializers.CharField(source='unit.code', read_only=True, default=None)
    variant_recipe_name = serializers.CharField(source='variant_recipe.name_en', read_only=True, default=None)

    class Meta:
        model  = ModifierOption
        fields = [
            'id', 'name_en', 'name_ar', 'price_delta', 'kind', 'pos_mods_string',
            'variant_recipe', 'variant_recipe_name', 'item_sku', 'quantity', 'unit', 'unit_code',
            'is_available', 'sort_order',
        ]

    def validate(self, attrs):
        kind = attrs.get('kind', getattr(self.instance, 'kind', ModifierOptionKind.CHOICE))
        if kind == ModifierOptionKind.ADDON and not (attrs.get('item_sku') or getattr(self.instance, 'item_sku', '')):
            raise serializers.ValidationError(
                {'item_sku': 'An add-on option needs the ingredient it consumes.'})
        return attrs


class ModifierGroupSerializer(serializers.ModelSerializer):
    options      = ModifierOptionSerializer(many=True, read_only=True)
    option_count = serializers.IntegerField(source='options.count', read_only=True)
    dish_count   = serializers.IntegerField(source='dish_uses.count', read_only=True)

    class Meta:
        model  = ModifierGroup
        fields = [
            'id', 'name_en', 'name_ar', 'selection', 'min_select', 'max_select',
            'notes', 'option_count', 'dish_count', 'options', 'created_at', 'updated_at',
        ]


class ModifierGroupWriteSerializer(serializers.ModelSerializer):
    options = ModifierOptionSerializer(many=True, required=False)

    class Meta:
        model  = ModifierGroup
        fields = ['name_en', 'name_ar', 'selection', 'min_select', 'max_select', 'notes', 'options']

    def validate(self, attrs):
        lo = attrs.get('min_select', getattr(self.instance, 'min_select', 0))
        hi = attrs.get('max_select', getattr(self.instance, 'max_select', None))
        if hi is not None and lo > hi:
            raise serializers.ValidationError({'max_select': 'Must be at least the minimum.'})
        return attrs

    _OPT_FIELDS = ('name_en', 'name_ar', 'price_delta', 'kind', 'pos_mods_string',
                   'variant_recipe', 'item_sku', 'quantity', 'unit', 'is_available')

    def _sync_options(self, group, options_data):
        if options_data is None:
            return
        keep = {str(o['id']) for o in options_data if o.get('id')}
        group.options.exclude(id__in=keep).delete()
        existing = {str(o.id): o for o in group.options.all()}
        for order, row in enumerate(options_data):
            fields = {f: row[f] for f in self._OPT_FIELDS if f in row}
            fields['sort_order'] = row.get('sort_order', order)
            opt = existing.get(str(row['id'])) if row.get('id') else None
            if opt is not None:
                for k, v in fields.items():
                    setattr(opt, k, v)
                opt.save()
            else:
                ModifierOption.objects.create(group=group, **fields)

    def create(self, validated_data):
        options = validated_data.pop('options', None)
        group = ModifierGroup.objects.create(**validated_data)
        self._sync_options(group, options)
        return group

    def update(self, instance, validated_data):
        options = validated_data.pop('options', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        self._sync_options(instance, options)
        return instance

    def to_representation(self, instance):
        return ModifierGroupSerializer(instance, context=self.context).data


# ── dish attachment (addressed by dish id) ──────────────────────────────────

class DishModifierGroupSerializer(serializers.ModelSerializer):
    group_name   = serializers.CharField(source='group.name_en', read_only=True)
    group_name_ar = serializers.CharField(source='group.name_ar', read_only=True)
    selection    = serializers.CharField(source='group.selection', read_only=True)
    option_count = serializers.IntegerField(source='group.options.count', read_only=True)

    class Meta:
        model  = DishModifierGroup
        fields = ['id', 'group', 'group_name', 'group_name_ar', 'selection',
                  'option_count', 'default_role', 'sort_order']


class DishModifierListSerializer(serializers.ModelSerializer):
    """One row per current dish — headline modifier facts + whether any exist."""
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    group_count   = serializers.SerializerMethodField()
    forced_count  = serializers.SerializerMethodField()

    class Meta:
        model  = DishRecipe
        fields = ['id', 'name_en', 'name_ar', 'recipe_code', 'branch', 'branch_ref',
                  'category', 'category_name', 'pos_item_name', 'group_count', 'forced_count']

    def get_group_count(self, obj):
        return obj.modifier_groups.count()

    def get_forced_count(self, obj):
        return obj.modifier_groups.filter(default_role=ModifierRole.FORCED).count()


class DishModifierDetailSerializer(serializers.ModelSerializer):
    category = serializers.CharField(source='category.name', read_only=True, default=None)
    modifier_groups = DishModifierGroupSerializer(many=True, read_only=True)

    class Meta:
        model  = DishRecipe
        fields = ['id', 'name_en', 'name_ar', 'recipe_code', 'branch', 'branch_ref',
                  'category', 'pos_item_name', 'version', 'modifier_groups', 'updated_at']


class DishModifierWriteSerializer(serializers.Serializer):
    """PATCH body: {groups: [{group: <id>, default_role, sort_order}]}. Replaces
    the dish's DishModifierGroup set. Never versions the recipe."""
    groups = serializers.ListField(child=serializers.DictField())

    def validate_groups(self, value):
        seen = set()
        for i, row in enumerate(value):
            gid = row.get('group')
            if not gid:
                raise serializers.ValidationError(f'Row {i + 1} has no group.')
            if gid in seen:
                raise serializers.ValidationError('A group is listed twice.')
            seen.add(gid)
            if not ModifierGroup.objects.filter(id=gid).exists():
                raise serializers.ValidationError(f'Unknown group {gid}.')
            role = row.get('default_role', ModifierRole.OPTIONAL)
            if role not in ModifierRole.values:
                raise serializers.ValidationError(f'Bad role "{role}".')
        return value

    def save(self, *, dish):
        rows = self.validated_data['groups']
        wanted = {str(r['group']): r for r in rows}
        dish.modifier_groups.exclude(group_id__in=wanted).delete()
        existing = {str(d.group_id): d for d in dish.modifier_groups.all()}
        for order, (gid, row) in enumerate(wanted.items()):
            role = row.get('default_role', ModifierRole.OPTIONAL)
            sort = row.get('sort_order', order)
            dmg = existing.get(gid)
            if dmg:
                dmg.default_role, dmg.sort_order = role, sort
                dmg.save(update_fields=['default_role', 'sort_order', 'updated_at'])
            else:
                DishModifierGroup.objects.create(
                    dish=dish, group_id=gid, default_role=role, sort_order=sort)
        return dish
