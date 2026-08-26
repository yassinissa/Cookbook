"""Menu / branch views — kept separate from the big recipe views.py."""
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.access import ALL, access_for
from apps.accounts.permissions import capability_required

from .models import DishRecipe, Menu, MenuLine, MenuSnapshot, MenuSnapshotLine
from .serializers.menu import (
    MenuDetailSerializer, MenuLineSerializer, MenuListSerializer,
    MenuSnapshotSerializer, MenuWriteSerializer,
)


def _fcp(cost, price):
    if not price or Decimal(price) <= 0:
        return None
    return (Decimal(cost) / Decimal(price) * 100).quantize(Decimal('0.01'))


def _scoped_menu_qs(qs, request):
    access = access_for(request)
    if access.is_superuser or access.scope.branch_ids is ALL:
        return qs
    if not access.scope.branch_ids:
        return qs.none()
    return qs.filter(branch_id__in=list(access.scope.branch_ids))


class MenuViewSet(viewsets.ModelViewSet):
    permission_classes = [capability_required(default='menu.view', by_action={
        'list': 'menu.view', 'retrieve': 'menu.view', 'snapshots': 'menu.view', 'trends': 'menu.view',
        'create': 'menu.edit', 'update': 'menu.edit', 'partial_update': 'menu.edit',
        'destroy': 'menu.edit', 'build': 'menu.edit', 'lines': 'menu.edit',
        'snapshot': 'menu.snapshot',
    })]
    pagination_class = None          # ~one menu per branch — never enough to page
    queryset = (Menu.objects
                .select_related('branch')
                .prefetch_related('lines__dish__category'))

    def get_queryset(self):
        return _scoped_menu_qs(super().get_queryset(), self.request)

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return MenuWriteSerializer
        if self.action == 'retrieve':
            return MenuDetailSerializer
        return MenuListSerializer

    # ── populate the menu from the branch's current dish recipes ──────────
    @action(detail=True, methods=['post'])
    def build(self, request, pk=None):
        menu = self.get_object()
        branch = menu.branch
        existing = set(menu.lines.values_list('dish_id', flat=True))
        candidates = (DishRecipe.objects
                      .filter(is_current=True)
                      .filter(Q(branch_ref=branch) | Q(branch__iexact=branch.name_en))
                      .select_related('category'))
        added = 0
        for i, dish in enumerate(candidates):
            if dish.id in existing:
                continue
            MenuLine.objects.create(
                menu=menu, dish=dish, pos_name=dish.pos_item_name or dish.name_en,
                image_url=dish.image_url, sort_order=(dish.category.sort_order if dish.category else 0) * 100 + i,
            )
            added += 1
        fresh = self.get_queryset().get(pk=menu.pk)
        return Response(dict(MenuDetailSerializer(fresh).data, _added=added))

    # ── add one dish ─────────────────────────────────────────────────────
    @action(detail=True, methods=['post'])
    def lines(self, request, pk=None):
        menu = self.get_object()
        dish_id = request.data.get('dish')
        if MenuLine.objects.filter(menu=menu, dish_id=dish_id).exists():
            return Response({'detail': 'That dish is already on the menu.'}, status=400)
        line = MenuLine.objects.create(
            menu=menu, dish_id=dish_id,
            sort_order=(menu.lines.count() + 1) * 10,
        )
        return Response(MenuLineSerializer(line).data, status=201)

    # ── freeze the current menu into a snapshot ──────────────────────────
    @action(detail=True, methods=['post'])
    def snapshot(self, request, pk=None):
        menu = self.get_object()
        snap = MenuSnapshot.objects.create(
            menu=menu, taken_by=getattr(request.user, 'username', ''),
            label=request.data.get('label', ''),
        )
        for line in menu.lines.select_related('dish', 'dish__category'):
            price = line.effective_price
            MenuSnapshotLine.objects.create(
                snapshot=snap,
                dish_name=line.dish.name_en,
                recipe_code=line.dish.recipe_code,
                category=line.dish.category.name if line.dish.category else '',
                cost=line.dish.cost,
                menu_price=price,
                food_cost_pct=_fcp(line.dish.cost, price),
            )
        menu.last_snapshot_at = timezone.now()
        menu.save(update_fields=['last_snapshot_at'])
        return Response(MenuSnapshotSerializer(snap).data, status=201)

    @action(detail=True, methods=['get'])
    def snapshots(self, request, pk=None):
        menu = self.get_object()
        qs = menu.snapshots.prefetch_related('lines').order_by('created_at')
        return Response(MenuSnapshotSerializer(qs, many=True).data)

    # ── time series for the charts ───────────────────────────────────────
    @action(detail=True, methods=['get'])
    def trends(self, request, pk=None):
        menu = self.get_object()
        points = []
        for snap in menu.snapshots.prefetch_related('lines').order_by('created_at'):
            lines = list(snap.lines.all())
            costs = [Decimal(l.cost) for l in lines]
            prices = [Decimal(l.menu_price) for l in lines if l.menu_price]
            fcps = [Decimal(l.food_cost_pct) for l in lines if l.food_cost_pct is not None]
            points.append({
                'date': snap.created_at.isoformat(),
                'label': snap.label,
                'dishes': len(lines),
                'total_cost': str(sum(costs, Decimal(0)).quantize(Decimal('0.001'))),
                'total_price': str(sum(prices, Decimal(0)).quantize(Decimal('0.001'))),
                'avg_food_cost_pct': str((sum(fcps, Decimal(0)) / len(fcps)).quantize(Decimal('0.01'))) if fcps else None,
                'over_30': sum(1 for f in fcps if f > 30),
            })
        return Response({'menu': menu.name or f'{menu.branch.name_en} Menu', 'points': points})


class MenuLineViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [capability_required(default='menu.edit')]
    queryset = MenuLine.objects.select_related('dish', 'dish__category', 'menu')
    serializer_class = MenuLineSerializer

    def get_queryset(self):
        access = access_for(self.request)
        qs = super().get_queryset()
        if access.is_superuser or access.scope.branch_ids is ALL:
            return qs
        if not access.scope.branch_ids:
            return qs.none()
        return qs.filter(menu__branch_id__in=list(access.scope.branch_ids))
