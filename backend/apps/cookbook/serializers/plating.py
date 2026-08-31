"""
Plating-guide serializers.

Like the QA standard, the plating guide is a OneToOne on DishRecipe and the
screen addresses it *by dish* — the list is one row per current dish so a
chef can see which dishes still have no plating guide. So these serializers
take a DishRecipe as their instance, not a PlatingGuide.

Photos are managed inline in the write payload by a stable id: an entry with
an `id` keeps that image (updating its caption / pins / order), an entry with
`image_data` (a base64 data: URI) adds a new one, and any existing image whose
id is absent from the payload is removed. Unchanged photos are never
re-uploaded.
"""
import base64
import binascii
import uuid

from django.core.files.base import ContentFile
from rest_framework import serializers

from apps.cookbook.models import DishRecipe, PlatingGuide, PlatingImage
from .dish_recipe import _absolute_image_url
from .reference import ApproverSerializer


_IMAGE_EXT = {'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
              'image/webp': 'webp', 'image/gif': 'gif'}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _decode_image(image_data):
    """A `data:<mime>;base64,<payload>` URI → a Django ContentFile + extension."""
    if not isinstance(image_data, str) or not image_data.startswith('data:'):
        raise serializers.ValidationError({'images': 'Each new photo needs a data: URI in image_data.'})
    try:
        header, payload = image_data.split(',', 1)
        mime = header.split(';')[0][5:].lower()
        ext = _IMAGE_EXT[mime]
        blob = base64.b64decode(payload, validate=True)
    except (ValueError, KeyError, binascii.Error):
        raise serializers.ValidationError(
            {'images': 'Unsupported or corrupt image. Use JPEG, PNG, WebP or GIF.'})
    if len(blob) > _MAX_IMAGE_BYTES:
        raise serializers.ValidationError({'images': 'Each photo must be 5 MB or smaller.'})
    return ContentFile(blob), ext


def _clean_pins(raw, *, image_label=''):
    """Normalise a pins list: {n:int>=1, x/y in 0..1, label_en/ar as text}.
    Silently drops entries that aren't objects."""
    if not isinstance(raw, list):
        return []
    out = []
    for i, pin in enumerate(raw):
        if not isinstance(pin, dict):
            continue
        try:
            x = min(1.0, max(0.0, float(pin.get('x', 0))))
            y = min(1.0, max(0.0, float(pin.get('y', 0))))
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                {'images': f'Pin {i + 1}{image_label} has a non-numeric position.'})
        try:
            n = int(pin.get('n', i + 1))
        except (TypeError, ValueError):
            n = i + 1
        out.append({
            'n': max(1, n),
            'x': round(x, 4),
            'y': round(y, 4),
            'label_en': str(pin.get('label_en', '') or '').strip()[:200],
            'label_ar': str(pin.get('label_ar', '') or '').strip()[:200],
        })
    return out


# ── read ────────────────────────────────────────────────────────────────────

class PlatingImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model  = PlatingImage
        fields = ['id', 'image_url', 'caption_en', 'caption_ar', 'sort_order', 'pins']

    def get_image_url(self, obj):
        url = obj.image.url if obj.image else ''
        return _absolute_image_url(self.context.get('request'), url)


class PlatingGuideSerializer(serializers.ModelSerializer):
    images      = PlatingImageSerializer(many=True, read_only=True)
    updated_by  = ApproverSerializer(read_only=True)
    approved_by = ApproverSerializer(read_only=True)

    class Meta:
        model  = PlatingGuide
        exclude = ['dish_recipe', 'is_active']


def _pin_total(guide):
    return sum(len(img.pins or []) for img in guide.images.all()) if guide else 0


class PlatingGuideListSerializer(serializers.ModelSerializer):
    """One row per current dish — headline plating facts + whether it exists."""
    category_name         = serializers.CharField(source='category.name', read_only=True, default=None)
    has_plating           = serializers.SerializerMethodField()
    image_count           = serializers.SerializerMethodField()
    pin_count             = serializers.SerializerMethodField()
    plate_spec            = serializers.SerializerMethodField()
    pickup_window_seconds = serializers.SerializerMethodField()

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'recipe_code', 'branch', 'branch_ref',
            'category', 'category_name',
            'has_plating', 'image_count', 'pin_count', 'plate_spec', 'pickup_window_seconds',
        ]

    def _g(self, obj):
        return getattr(obj, 'plating', None)

    def get_has_plating(self, obj):
        return self._g(obj) is not None

    def get_image_count(self, obj):
        g = self._g(obj)
        return g.images.count() if g else 0

    def get_pin_count(self, obj):
        return _pin_total(self._g(obj))

    def get_plate_spec(self, obj):
        g = self._g(obj)
        return g.plate_spec if g else ''

    def get_pickup_window_seconds(self, obj):
        g = self._g(obj)
        return g.pickup_window_seconds if g else None


class PlatingGuideDetailSerializer(serializers.ModelSerializer):
    category = serializers.CharField(source='category.name', read_only=True, default=None)
    section  = serializers.CharField(source='section.name', read_only=True, default=None)
    plating  = PlatingGuideSerializer(read_only=True)

    class Meta:
        model  = DishRecipe
        fields = [
            'id', 'name_en', 'name_ar', 'recipe_code', 'revision',
            'branch', 'branch_ref', 'category', 'section', 'image_url',
            'version', 'plating', 'updated_at',
        ]


# ── write ───────────────────────────────────────────────────────────────────

class PlatingGuideWriteSerializer(serializers.ModelSerializer):
    """Upsert the PlatingGuide for a dish. Never touches the recipe or its
    version. Empty strings on the numeric / FK fields become NULL."""
    images = serializers.ListField(child=serializers.DictField(), required=False)

    class Meta:
        model  = PlatingGuide
        exclude = ['dish_recipe', 'id', 'created_at', 'updated_at', 'is_active']

    _NULLABLE = {'pickup_window_seconds', 'updated_by', 'approved_by'}

    def to_internal_value(self, data):
        cleaned = {
            k: (None if (k in self._NULLABLE and v in ('', None)) else v)
            for k, v in data.items()
        }
        return super().to_internal_value(cleaned)

    def validate_images(self, value):
        for i, entry in enumerate(value):
            if not entry.get('id') and not entry.get('image_data'):
                raise serializers.ValidationError(
                    f'Photo {i + 1} needs either an id (to keep it) or image_data (a new upload).')
        return value

    def _apply_images(self, guide, images_data):
        if images_data is None:
            return
        keep_ids = {str(e['id']) for e in images_data if e.get('id')}
        for img in guide.images.exclude(id__in=keep_ids):
            img.image.delete(save=False)
            img.delete()

        existing = {str(img.id): img for img in guide.images.all()}
        for order, entry in enumerate(images_data):
            label = f' on photo {order + 1}'
            fields = {
                'caption_en': str(entry.get('caption_en', '') or '')[:255],
                'caption_ar': str(entry.get('caption_ar', '') or '')[:255],
                'sort_order': order,
                'pins': _clean_pins(entry.get('pins', []), image_label=label),
            }
            if entry.get('id') and str(entry['id']) in existing:
                img = existing[str(entry['id'])]
                for k, v in fields.items():
                    setattr(img, k, v)
                img.save(update_fields=[*fields.keys(), 'updated_at'])
            else:
                content, ext = _decode_image(entry.get('image_data'))
                img = PlatingImage(guide=guide, **fields)
                img.image.save(f'{uuid.uuid4().hex}.{ext}', content, save=False)
                img.save()

    def create(self, validated_data):
        images_data = validated_data.pop('images', None)
        guide = PlatingGuide.objects.create(**validated_data)
        self._apply_images(guide, images_data)
        return guide

    def update(self, instance, validated_data):
        images_data = validated_data.pop('images', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        self._apply_images(instance, images_data)
        return instance
