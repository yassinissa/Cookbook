"""
Weekly cost-report digest.

`build_weekly_digest(user)` assembles one recipient's payload — over-target
dishes, the week's biggest cost movers, and coverage gaps — scoped to the
branches that user can see. Returns None when there is nothing worth an email.

Reused by `manage.py send_cost_digest` and the dashboard view (which shares
`dish_food_cost_pct` / `TARGET_PCT`).
"""
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from apps.accounts.access import ALL, access_for

from .models import Branch, DishPriceHistory, DishRecipe

TARGET_PCT = Decimal('30')
WINDOW_DAYS = 7
# a mover is only interesting if the per-serving cost moved at least this much
_MOVER_MIN_FILS = Decimal('0.003')
_MOVER_MIN_PCT = Decimal('4')


def _dec(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def dish_food_cost_pct(dish):
    """Food-cost % for a dish — the stored breakdown first, else cost / price."""
    d = _dec((dish.cost_breakdown or {}).get('food_cost_pct'))
    if d is not None:
        return d
    price = _dec(dish.selling_price)
    if price and price > 0:
        return (Decimal(dish.cost) / price * 100).quantize(Decimal('0.01'))
    return None


def _scoped_current_dishes(user):
    access = access_for(user)
    if not access.can('costing.view'):
        return None, access
    qs = DishRecipe.objects.filter(is_current=True).select_related('branch_ref', 'category')
    scope = access.scope.branch_ids
    if not (access.is_superuser or scope is ALL):
        qs = qs.filter(branch_ref_id__in=list(scope)) if scope else qs.none()
    return qs, access


def _branch_name(dish):
    return dish.branch_ref.name_en if dish.branch_ref_id else (dish.branch or '—')


def _movers(dishes, since):
    """Biggest per-serving cost change over the window, from DishPriceHistory."""
    dish_ids = [d.id for d in dishes]
    history = (DishPriceHistory.objects
               .filter(dish_recipe_id__in=dish_ids)
               .order_by('dish_recipe_id', 'created_at'))
    by_dish = {}
    for row in history:
        by_dish.setdefault(row.dish_recipe_id, []).append(row)

    out = []
    for dish in dishes:
        rows = by_dish.get(dish.id)
        if not rows or len(rows) < 2:
            continue
        latest = rows[-1]
        # baseline = last snapshot at or before the window start, else the oldest
        older = [r for r in rows if r.created_at <= since]
        baseline = older[-1] if older else rows[0]
        if baseline is latest:
            continue
        delta = Decimal(latest.cost) - Decimal(baseline.cost)
        if delta.copy_abs() < _MOVER_MIN_FILS:
            continue
        base = Decimal(baseline.cost) or Decimal('0.001')
        pct = (delta / base * 100).quantize(Decimal('0.1'))
        if pct.copy_abs() < _MOVER_MIN_PCT:
            continue
        out.append({
            'name_en': dish.name_en,
            'branch': _branch_name(dish),
            'from_cost': str(Decimal(baseline.cost).quantize(Decimal('0.001'))),
            'to_cost': str(Decimal(latest.cost).quantize(Decimal('0.001'))),
            'delta': str(delta.quantize(Decimal('0.001'))),
            'delta_pct': str(pct),
            'food_cost_pct': str(dish_food_cost_pct(dish)) if dish_food_cost_pct(dish) is not None else None,
        })
    out.sort(key=lambda m: Decimal(m['delta']), reverse=True)
    return out


def build_weekly_digest(user):
    dishes_qs, access = _scoped_current_dishes(user)
    if dishes_qs is None:
        return None
    dishes = list(dishes_qs.order_by('name_en'))
    if not dishes:
        return None

    since = timezone.now() - timedelta(days=WINDOW_DAYS)

    priced = [(d, dish_food_cost_pct(d)) for d in dishes]
    rated = [f for _, f in priced if f is not None]
    avg_pct = (sum(rated) / len(rated)).quantize(Decimal('0.01')) if rated else None

    over_target = sorted(
        ({
            'name_en': d.name_en,
            'name_ar': d.name_ar,
            'branch': _branch_name(d),
            'food_cost_pct': str(f),
            'cost': str(d.cost),
            'selling_price': str(d.selling_price) if d.selling_price is not None else None,
        } for d, f in priced if f is not None and f > TARGET_PCT),
        key=lambda r: Decimal(r['food_cost_pct']), reverse=True,
    )

    gaps = [{
        'name_en': d.name_en,
        'branch': _branch_name(d),
        'issues': [f"{i.get('sku')}: {i.get('status')}" for i in (d.cost_breakdown or {}).get('issues', [])[:4]],
    } for d in dishes if (d.cost_breakdown or {}).get('issues')]

    movers = _movers(dishes, since)

    if not (over_target or movers or gaps):
        return None

    if access.scope.branch_ids is ALL or access.is_superuser:
        branches = 'all'
    else:
        branches = list(
            Branch.objects.filter(id__in=list(access.scope.branch_ids))
            .order_by('name_en').values_list('name_en', flat=True)
        )

    return {
        'user': user,
        'branches': branches,
        'window_days': WINDOW_DAYS,
        'target_pct': str(TARGET_PCT),
        'avg_pct': str(avg_pct) if avg_pct is not None else None,
        'dish_count': len(dishes),
        'over_target': over_target[:15],
        'over_target_total': len(over_target),
        'movers': movers[:8],
        'gaps': gaps[:10],
        'gaps_total': len(gaps),
    }
