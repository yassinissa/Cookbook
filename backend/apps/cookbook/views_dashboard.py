"""
Dashboard aggregate — one call for the landing screen.

Read-only, computed from models that already exist (dish/production recipes,
menus, snapshots, activity logs). No new tables. The frontend renders KPIs,
"needs attention", "over food-cost target", per-branch menu health and a
recent-activity feed from this single payload.
"""
from decimal import Decimal, InvalidOperation
from itertools import chain

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import ALL, access_for
from apps.accounts.permissions import capability_required

from .models import (
    Branch, DishRecipe, DishRecipeActivityLog, DishStandard, Menu, MenuSnapshot,
    ProductionRecipe, ProductionRecipeActivityLog,
)
from .reporting import TARGET_PCT, dish_food_cost_pct as _dish_food_cost_pct


def _dec(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _attention_reasons(dish):
    reasons = []
    if dish.rating_status in ('attention', 'fix'):
        reasons.append(f'rating:{dish.rating_status}')
    if not dish.cost or Decimal(dish.cost) == 0:
        reasons.append('no_cost')
    if dish.selling_price is None:
        reasons.append('no_price')
    else:
        fcp = _dish_food_cost_pct(dish)
        if fcp is not None and fcp > TARGET_PCT:
            reasons.append('over_target')
    if (dish.cost_breakdown or {}).get('issues'):
        reasons.append('uncosted_lines')
    return reasons


class DashboardView(APIView):
    permission_classes = [capability_required(default='dashboard.view')]

    def get(self, request):
        access = access_for(request)
        branch_scope = access.scope.branch_ids   # set[str] | ALL
        show_cost = access.can('costing.view')

        dish_qs = DishRecipe.objects.filter(is_current=True).select_related('branch_ref', 'category')
        branch_qs = Branch.objects.all()
        menu_qs = Menu.objects.filter(is_active=True).select_related('branch')
        snap_qs = MenuSnapshot.objects.select_related('menu__branch')
        if not access.is_superuser and branch_scope is not ALL:
            ids = list(branch_scope)
            dish_qs = dish_qs.filter(branch_ref_id__in=ids) if ids else dish_qs.none()
            branch_qs = branch_qs.filter(id__in=ids) if ids else branch_qs.none()
            menu_qs = menu_qs.filter(branch_id__in=ids) if ids else menu_qs.none()
            snap_qs = snap_qs.filter(menu__branch_id__in=ids) if ids else snap_qs.none()

        dishes = list(dish_qs)

        fcps = [(d, _dish_food_cost_pct(d)) for d in dishes]
        rated = [f for _, f in fcps if f is not None]
        avg_pct = (sum(rated) / len(rated)).quantize(Decimal('0.01')) if rated else None
        over = [(d, f) for d, f in fcps if f is not None and f > TARGET_PCT]

        attention = []
        for d in dishes:
            reasons = _attention_reasons(d)
            if reasons:
                attention.append({
                    'id': str(d.id),
                    'name_en': d.name_en,
                    'name_ar': d.name_ar,
                    'recipe_code': d.recipe_code,
                    'branch': (d.branch_ref.name_en if d.branch_ref_id else d.branch),
                    'reasons': reasons,
                })

        over_sorted = sorted(over, key=lambda t: t[1], reverse=True)
        over_target = [{
            'id': str(d.id),
            'name_en': d.name_en,
            'name_ar': d.name_ar,
            'branch': (d.branch_ref.name_en if d.branch_ref_id else d.branch),
            'food_cost_pct': str(f),
            'cost': str(d.cost),
            'selling_price': str(d.selling_price) if d.selling_price is not None else None,
        } for d, f in over_sorted[:12]]

        # ── per-branch menu health ──────────────────────────────────────
        menus = {m.branch_id: m for m in menu_qs}
        by_branch = {}
        for d, f in fcps:
            if d.branch_ref_id:
                by_branch.setdefault(d.branch_ref_id, []).append(f)
        branch_health = []
        for b in branch_qs:
            branch_fcps = [x for x in by_branch.get(b.id, []) if x is not None]
            menu = menus.get(b.id)
            trend = []
            if menu:
                for snap in menu.snapshots.prefetch_related('lines').order_by('created_at')[:12]:
                    line_fcps = [_dec(l.food_cost_pct) for l in snap.lines.all()]
                    line_fcps = [x for x in line_fcps if x is not None]
                    trend.append({
                        'label': snap.label or snap.created_at.strftime('%d %b'),
                        'date': snap.created_at.isoformat(),
                        'avg_food_cost_pct': str((sum(line_fcps) / len(line_fcps)).quantize(Decimal('0.01'))) if line_fcps else None,
                    })
            branch_health.append({
                'branch_id': str(b.id),
                'name_en': b.name_en,
                'name_ar': b.name_ar,
                'menu_id': str(menu.id) if menu else None,
                'dishes': len(by_branch.get(b.id, [])),
                'avg_food_cost_pct': str((sum(branch_fcps) / len(branch_fcps)).quantize(Decimal('0.01'))) if branch_fcps else None,
                'over_target': sum(1 for x in branch_fcps if x > TARGET_PCT),
                'last_snapshot_at': menu.last_snapshot_at.isoformat() if menu and menu.last_snapshot_at else None,
                'trend': trend,
            })

        # ── recent activity (both recipe types, newest first) ───────────
        scoped_dish_ids = None if (access.is_superuser or branch_scope is ALL) else [d.id for d in dishes]
        dish_logs = DishRecipeActivityLog.objects.select_related('recipe').order_by('-created_at')
        if scoped_dish_ids is not None:
            dish_logs = dish_logs.filter(recipe_id__in=scoped_dish_ids)
        dish_logs = dish_logs[:12]
        # production recipes aren't branch-scoped; only show them to users who can see production
        prod_logs = (ProductionRecipeActivityLog.objects.select_related('recipe').order_by('-created_at')[:12]
                     if access.can('production.view') else [])
        merged = sorted(
            chain(
                (('dish', l) for l in dish_logs),
                (('production', l) for l in prod_logs),
            ),
            key=lambda t: t[1].created_at, reverse=True,
        )[:12]
        recent_activity = [{
            'id': str(l.id),
            'kind': kind,
            'action': l.action_type,
            'action_display': l.get_action_type_display(),
            'description': l.description,
            'recipe_id': str(l.recipe_id),
            'recipe_name': l.recipe.name_en,
            'changed_by': l.changed_by or None,
            'created_at': l.created_at.isoformat(),
        } for kind, l in merged]

        # ── company cost trend (last ~12 snapshots, in scope) ──────────
        cost_trend = []
        for snap in (snap_qs.prefetch_related('lines').order_by('-created_at')[:12])[::-1]:
            lines = list(snap.lines.all())
            line_fcps = [x for x in (_dec(l.food_cost_pct) for l in lines) if x is not None]
            total_cost = sum((Decimal(l.cost) for l in lines), Decimal('0'))
            cost_trend.append({
                'label': f'{snap.menu.branch.name_en} · {snap.created_at.strftime("%d %b")}',
                'date': snap.created_at.isoformat(),
                'avg_food_cost_pct': str((sum(line_fcps) / len(line_fcps)).quantize(Decimal('0.01'))) if line_fcps else None,
                'total_cost': str(total_cost.quantize(Decimal('0.001'))),
            })

        payload = {
            'target_pct': str(TARGET_PCT),
            'totals': {
                'dishes': len(dishes),
                'production_recipes': (ProductionRecipe.objects.filter(is_current=True).count()
                                       if access.can('production.view') else 0),
                'menus': len(menus),
                'standards': DishStandard.objects.count() if access.can('standard.view') else 0,
                'branches': branch_qs.count(),
            },
            'food_cost': {
                'avg_pct': str(avg_pct) if avg_pct is not None else None,
                'over_target': len(over),
                'priced': len(rated),
            },
            'attention': {'count': len(attention), 'items': attention[:8]},
            'over_target': over_target,
            'branch_health': branch_health,
            'recent_activity': recent_activity,
            'cost_trend': cost_trend,
        }

        if not show_cost:
            payload['food_cost'] = {'avg_pct': None, 'over_target': payload['food_cost']['over_target'], 'priced': 0}
            for row in payload['over_target']:
                row['cost'] = row['selling_price'] = row['food_cost_pct'] = None
            for row in payload['branch_health']:
                row['avg_food_cost_pct'] = None
                row['trend'] = [dict(p, avg_food_cost_pct=None) for p in row['trend']]
            for row in payload['cost_trend']:
                row['avg_food_cost_pct'] = row['total_cost'] = None

        return Response(payload)
