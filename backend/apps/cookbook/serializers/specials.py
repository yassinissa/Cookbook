"""
Serializers for the specials calendar — MenuPeriod + its nested MenuPeriodLine
operations.

Lines are managed inline in the period write payload and reconciled by id: an
entry with an `id` is updated, one without is created, and any existing line
whose id is absent from the payload is deleted. Same shape as the plating-guide
photo reconcile, minus the file handling.
"""
from rest_framework import serializers

from apps.cookbook.models import (
    DishRecipe, MenuPeriod, MenuPeriodLine, MenuPeriodOp, WEEKDAY_ALL,
)

# op → the fields it actually needs a value in
_OP_REQUIRES = {
    MenuPeriodOp.ADD: (),                       # a dish is enough; price/photo/copy fall back to the recipe
    MenuPeriodOp.REMOVE: (),
    MenuPeriodOp.REPRICE: ('menu_price',),
    MenuPeriodOp.REPLACE_PHOTO: ('image_url',),
    MenuPeriodOp.REPLACE_COPY: ('description_en',),
}


class MenuPeriodLineSerializer(serializers.ModelSerializer):
    id           = serializers.UUIDField(required=False)
    dish_name    = serializers.CharField(source='dish.name_en', read_only=True)
    dish_name_ar = serializers.CharField(source='dish.name_ar', read_only=True)
    op_display   = serializers.CharField(source='get_op_display', read_only=True)

    class Meta:
        model  = MenuPeriodLine
        fields = [
            'id', 'dish', 'dish_name', 'dish_name_ar', 'op', 'op_display',
            'menu_price', 'image_url', 'description_en', 'description_ar',
            'pos_name', 'sort_order',
        ]

    def validate(self, attrs):
        op = attrs.get('op')
        for field in _OP_REQUIRES.get(op, ()):
            val = attrs.get(field)
            if val in (None, ''):
                raise serializers.ValidationError(
                    {field: f'Required when the operation is "{op}".'})
        return attrs

    def validate_dish(self, dish):
        if not dish.is_current:
            raise serializers.ValidationError('That dish recipe is not the current version.')
        return dish


class MenuPeriodSerializer(serializers.ModelSerializer):
    """Read shape — the period with its operations."""
    lines        = MenuPeriodLineSerializer(many=True, read_only=True)
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    line_count   = serializers.IntegerField(source='lines.count', read_only=True)

    class Meta:
        model  = MenuPeriod
        fields = [
            'id', 'menu', 'kind', 'kind_display', 'name_en', 'name_ar',
            'starts_on', 'ends_on', 'weekday_mask', 'is_live', 'notes',
            'line_count', 'lines', 'created_at', 'updated_at',
        ]
        read_only_fields = ['menu']


class MenuPeriodWriteSerializer(serializers.ModelSerializer):
    lines = MenuPeriodLineSerializer(many=True, required=False)

    class Meta:
        model  = MenuPeriod
        fields = [
            'kind', 'name_en', 'name_ar', 'starts_on', 'ends_on',
            'weekday_mask', 'is_live', 'notes', 'lines',
        ]

    def validate_weekday_mask(self, value):
        if not (0 <= value <= WEEKDAY_ALL):
            raise serializers.ValidationError('Must be a 7-bit weekday mask (0–127).')
        if value == 0:
            raise serializers.ValidationError('At least one weekday must be selected.')
        return value

    def validate(self, attrs):
        starts = attrs.get('starts_on', getattr(self.instance, 'starts_on', None))
        ends = attrs.get('ends_on', getattr(self.instance, 'ends_on', None))
        if starts and ends and ends < starts:
            raise serializers.ValidationError({'ends_on': 'Must be on or after the start date.'})
        return attrs

    # ── nested line reconcile ────────────────────────────────────────────
    _LINE_FIELDS = ('dish', 'op', 'menu_price', 'image_url',
                    'description_en', 'description_ar', 'pos_name')

    def _sync_lines(self, period, lines_data):
        if lines_data is None:
            return
        keep_ids = {str(row['id']) for row in lines_data if row.get('id')}
        period.lines.exclude(id__in=keep_ids).delete()
        existing = {str(line.id): line for line in period.lines.all()}

        for order, row in enumerate(lines_data):
            fields = {f: row[f] for f in self._LINE_FIELDS if f in row}
            fields['sort_order'] = row.get('sort_order', order)
            line = existing.get(str(row['id'])) if row.get('id') else None
            if line is not None:
                for attr, val in fields.items():
                    setattr(line, attr, val)
                line.save()
            else:
                MenuPeriodLine.objects.create(period=period, **fields)

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', None)
        period = MenuPeriod.objects.create(menu=self.context['menu'], **validated_data)
        self._sync_lines(period, lines_data)
        return period

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        self._sync_lines(instance, lines_data)
        return instance

    def to_representation(self, instance):
        return MenuPeriodSerializer(instance, context=self.context).data
