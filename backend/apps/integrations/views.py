"""
NOTE — Read-only proxy onto inventory-platform's reference data.
Cookbook's frontend calls these instead of the inventory API directly, so
the service-account credentials never leave the backend.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .inventory_client import InventoryClient, InventoryAPIError


def _proxy(request, method_name):
    client = InventoryClient()
    try:
        data = getattr(client, method_name)(params=request.query_params)
    except InventoryAPIError as exc:
        return Response({'detail': str(exc)}, status=502)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def items(request):
    return _proxy(request, 'get_items')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def item_detail(request, item_id):
    client = InventoryClient()
    try:
        data = client.get_item(item_id)
    except InventoryAPIError as exc:
        return Response({'detail': str(exc)}, status=502)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stores(request):
    return _proxy(request, 'get_stores')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def prep_kitchens(request):
    return _proxy(request, 'get_prep_kitchens')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def units(request):
    client = InventoryClient()
    try:
        data = client.get_units()
    except InventoryAPIError as exc:
        return Response({'detail': str(exc)}, status=502)
    return Response(data)
