from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from apps.cookbook.models import (
    Allergen, ItemConversion, ItemConversionLine, ItemNutrition, ItemStorage,
)
from apps.cookbook.models.item_supplement import CostSource
from .reference import UnitScaleSerializer, ApproverSerializer, AllergenSerializer


class ItemConversionLineSerializer(serializers.ModelSerializer):
    unit_detail = UnitScaleSerializer(source='unit', read_only=True)

    class Meta:
        model  = ItemConversionLine
        fields = ['id', 'label', 'quantity', 'unit', 'unit_detail', 'gram_equivalent']


class ItemConversionSerializer(serializers.ModelSerializer):
    """
    Read shape: nested lines + resolved approver/unit names.
    Write shape: item_sku + lines (delete-and-recreate, same convention as
    recipe ingredients) + updated_by/approved_by ids.
    """
    lines        = ItemConversionLineSerializer(many=True, required=False)
    updated_by_detail  = ApproverSerializer(source='updated_by', read_only=True)
    approved_by_detail = ApproverSerializer(source='approved_by', read_only=True)
    base_unit_detail   = UnitScaleSerializer(source='base_unit', read_only=True)
    allergens          = serializers.PrimaryKeyRelatedField(queryset=Allergen.objects.all(), many=True, required=False)
    allergens_detail   = AllergenSerializer(source='allergens', many=True, read_only=True)

    class Meta:
        model  = ItemConversion
        fields = [
            'id', 'item_sku', 'note_to_add', 'allergens', 'allergens_detail',
            'base_unit', 'base_unit_detail', 'cost_per_base_unit',
            'order_unit', 'order_cost', 'pack_qty', 'cost_source', 'cost_updated_at',
            'grams_per_piece', 'pieces_per_pack', 'pieces_per_kg', 'pieces_or_pack_per_box',
            'updated_by', 'updated_by_detail', 'approved_by', 'approved_by_detail',
            'lines', 'created_at', 'updated_at',
        ]
        read_only_fields = ['cost_updated_at']

    def _save_lines(self, instance, lines_data):
        # lines_data comes from the nested ItemConversionLineSerializer, so
        # 'unit' is already a resolved UnitScale instance, not a raw id.
        instance.lines.all().delete()
        for line in lines_data:
            ItemConversionLine.objects.create(
                item_conversion=instance,
                label=line['label'],
                quantity=line['quantity'],
                unit=line['unit'],
                gram_equivalent=line.get('gram_equivalent'),
            )

    def _stamp_cost(self, validated_data):
        """A cost edited through this serializer is a manual entry."""
        if 'cost_per_base_unit' in validated_data:
            validated_data.setdefault('cost_source', CostSource.MANUAL)
            validated_data['cost_updated_at'] = timezone.now()

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        allergens = validated_data.pop('allergens', None)
        self._stamp_cost(validated_data)
        instance = ItemConversion.objects.create(**validated_data)
        if allergens is not None:
            instance.allergens.set(allergens)
        self._save_lines(instance, lines_data)
        return instance

    def _keep_cost_on_unit_change(self, instance, validated_data):
        """order_cost is the price of ONE order_unit. When the order unit
        itself changes (e.g. Box -> PKT, set from the inventory stock unit)
        and no new price comes with it, that price no longer means anything:
        keep the item's cost per base unit instead, so recipe costs don't
        jump. A pack-size correction alone keeps the pack price, and the cost
        per gram follows it — that's the point of correcting it."""
        from apps.cookbook.stock_units import same_unit
        new_unit = validated_data.get('order_unit')
        if (new_unit is None or 'order_cost' in validated_data or not instance.order_unit
                or same_unit(new_unit, instance.order_unit)):
            return
        if instance.order_cost and instance.pack_qty:
            per_old_base = Decimal(instance.order_cost) / Decimal(instance.pack_qty)
        else:
            per_old_base = instance.cost_per_base_unit
        old_base, new_base = instance.base_unit, validated_data.get('base_unit', instance.base_unit)
        per_new_base = None
        if per_old_base is not None and old_base and new_base and old_base.dimension == new_base.dimension:
            per_new_base = (Decimal(per_old_base) * Decimal(new_base.factor_to_canonical)
                            / Decimal(old_base.factor_to_canonical)).quantize(Decimal('1e-10'))
        validated_data['order_cost'] = None
        validated_data['cost_per_base_unit'] = per_new_base

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        allergens = validated_data.pop('allergens', None)
        self._keep_cost_on_unit_change(instance, validated_data)
        self._stamp_cost(validated_data)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if allergens is not None:
            instance.allergens.set(allergens)
        if lines_data is not None:
            self._save_lines(instance, lines_data)
        return instance


class ItemNutritionSerializer(serializers.ModelSerializer):
    unit_scale_detail  = UnitScaleSerializer(source='unit_scale', read_only=True)
    updated_by_detail  = ApproverSerializer(source='updated_by', read_only=True)
    approved_by_detail = ApproverSerializer(source='approved_by', read_only=True)

    class Meta:
        model  = ItemNutrition
        fields = [
            'id', 'item_sku', 'unit_scale', 'unit_scale_detail',
            'calories', 'fat_g', 'protein_g', 'saturated_fat_g', 'trans_fat_g',
            'cholesterol_mg', 'sodium_mg', 'carbs_g', 'fibers_g', 'sugars_g', 'added_sugars_g',
            'verification_notes',
            'updated_by', 'updated_by_detail', 'approved_by', 'approved_by_detail',
            'created_at', 'updated_at',
        ]


class ItemStorageSerializer(serializers.ModelSerializer):
    """Read + write the per-SKU storage supplement. Empty strings on the
    nullable hour / FK fields are coerced to NULL, same as the QA standard."""
    storage_band_display = serializers.CharField(source='get_storage_band_display', read_only=True)
    updated_by_detail    = ApproverSerializer(source='updated_by', read_only=True)
    approved_by_detail   = ApproverSerializer(source='approved_by', read_only=True)

    class Meta:
        model  = ItemStorage
        fields = [
            'id', 'item_sku', 'storage_band', 'storage_band_display',
            'shelf_life_hours', 'opened_shelf_life_hours',
            'storage_instructions_en', 'storage_instructions_ar',
            'label_notes_en', 'label_notes_ar',
            'updated_by', 'updated_by_detail', 'approved_by', 'approved_by_detail',
            'created_at', 'updated_at',
        ]

    _NULLABLE = {'shelf_life_hours', 'opened_shelf_life_hours', 'updated_by', 'approved_by'}

    def to_internal_value(self, data):
        cleaned = {
            k: (None if (k in self._NULLABLE and v in ('', None)) else v)
            for k, v in data.items()
        }
        return super().to_internal_value(cleaned)
