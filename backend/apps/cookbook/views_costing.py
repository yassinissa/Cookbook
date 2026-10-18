"""
Live cost preview for the recipe editors.

`POST cookbook/cost-preview/` costs ingredient rows that haven't been saved
yet — same maths as a save (`costing.cost_line`), nothing written — and
explains each line: price per base unit + its source, the unit conversion
used, and what inventory-platform will deduct in the item's stock unit (or
why publishing would refuse the line).
"""
from decimal import Decimal

from django.core.cache import cache
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import capability_required
from .costing import CostContext, compose_serving_cost, explain_line
from .services import get_inventory_items_by_sku

# The editor previews on every pause in typing; walking inventory-platform's
# whole item list each time would make that crawl. A short cache is fine —
# a save / recalculate still reads it live.
_ITEMS_CACHE_KEY = 'cookbook:cost-preview:items'
_ITEMS_CACHE_SECONDS = 120


def _items_by_sku():
    items = cache.get(_ITEMS_CACHE_KEY)
    if items is None:
        items = get_inventory_items_by_sku()
        if items:   # don't pin an outage for two minutes
            cache.set(_ITEMS_CACHE_KEY, items, _ITEMS_CACHE_SECONDS)
    return items


class _LineSerializer(serializers.Serializer):
    item_sku = serializers.CharField(allow_blank=True, max_length=64)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4, required=False,
                                        allow_null=True, min_value=Decimal(0))
    unit = serializers.CharField(allow_blank=True, required=False, allow_null=True)


class _PreviewSerializer(serializers.Serializer):
    lines = _LineSerializer(many=True, max_length=300)
    expected_waste_pct = serializers.DecimalField(max_digits=6, decimal_places=2, required=False,
                                                  allow_null=True, min_value=Decimal(0),
                                                  max_value=Decimal(100))


class CostPreviewView(APIView):
    permission_classes = [capability_required(default='costing.view')]

    def post(self, request):
        s = _PreviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        lines = s.validated_data['lines']
        items = _items_by_sku()
        ctx = CostContext([l['item_sku'] for l in lines], items)
        out = [
            explain_line(l, ctx, stock_code=(items.get(l['item_sku']) or {}).get('unit_code'))
            for l in lines
        ]
        total = sum((Decimal(o['amount']) for o in out), Decimal(0))
        bd = compose_serving_cost(total, s.validated_data.get('expected_waste_pct') or 0, 0, False)
        return Response({
            'lines': out,
            'items': str(bd['items']),
            'waste': str(bd['waste']),
            'per_serving': str(bd['per_serving']),
            'inventory_reachable': bool(items),
        })
