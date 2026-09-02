"""
Menu-period resolver — "what is branch X's menu on date D?"

The base menu (a Menu and its MenuLine rows) is the source of truth. Zero or
more MenuPeriods layer dated changes over it: a seasonal range, a recurring
daily special, a one-off event. `resolve_menu(menu, on)` applies every period
active on `on`, in precedence order, to a working copy of the line list and
returns the effective, category-grouped result.

Precedence when several periods cover one day — the normal case, e.g. a
seasonal menu plus a Friday special:

    1. by kind:  event  >  daily_special  >  seasonal   (MenuPeriod.rank)
    2. then by start date, most recent first
    3. then by created_at, most recent first

Periods are applied low-precedence first, so a higher-precedence period's op
is applied last and wins on conflict.

Pure read. Never writes. Reused by the calendar preview
(`GET /cookbook/menus/<id>/effective/`) and, in feature 4b, frozen verbatim
into MenuEdition.payload on publish.
"""
from collections import OrderedDict
from decimal import Decimal

from .models import MenuPeriodOp


def _dec(v):
    return Decimal(str(v)) if v is not None else None


def _line_from_base(ml):
    dish = ml.dish
    cat = dish.category
    return {
        'dish_id': str(dish.id),
        'name_en': dish.name_en,
        'name_ar': dish.name_ar,
        'recipe_code': dish.recipe_code,
        'category': cat.name if cat else '',
        'category_ar': cat.menu_title_ar if cat else '',
        'category_order': cat.sort_order if cat else 99,
        'price': _dec(ml.menu_price) if ml.menu_price is not None else _dec(dish.selling_price),
        'image_url': ml.image_url or dish.image_url or '',
        'description_en': ml.menu_description_en,
        'description_ar': ml.menu_description_ar,
        'pos_name': ml.pos_name or dish.pos_item_name or dish.name_en,
        'is_available': ml.is_available,
        'rating': str(dish.rating) if dish.rating is not None else None,
        'rating_status': dish.rating_status,
        'sort_order': ml.sort_order,
        'source': 'base',
        '_removed': False,
    }


def _line_from_period(pl, period):
    dish = pl.dish
    cat = dish.category
    return {
        'dish_id': str(dish.id),
        'name_en': dish.name_en,
        'name_ar': dish.name_ar,
        'recipe_code': dish.recipe_code,
        'category': cat.name if cat else '',
        'category_ar': cat.menu_title_ar if cat else '',
        'category_order': cat.sort_order if cat else 99,
        'price': _dec(pl.menu_price) if pl.menu_price is not None else _dec(dish.selling_price),
        'image_url': pl.image_url or dish.image_url or '',
        'description_en': pl.description_en,
        'description_ar': pl.description_ar,
        'pos_name': pl.pos_name or dish.pos_item_name or dish.name_en,
        'is_available': True,
        'rating': str(dish.rating) if dish.rating is not None else None,
        'rating_status': dish.rating_status,
        'sort_order': 1000 + pl.sort_order,   # period adds sort after base lines
        'source': period.kind,
        '_removed': False,
    }


def _apply_op(working, pl, period):
    op = pl.op
    dish_id = str(pl.dish_id)
    line = working.get(dish_id)

    if op == MenuPeriodOp.ADD:
        if line is None or line['_removed']:
            working[dish_id] = _line_from_period(pl, period)
        return
    if line is None:
        return  # remove / reprice / replace on a dish that isn't on the menu — no-op

    if op == MenuPeriodOp.REMOVE:
        line['_removed'] = True
    elif op == MenuPeriodOp.REPRICE:
        line['price'] = _dec(pl.menu_price)
        line['source'] = period.kind
    elif op == MenuPeriodOp.REPLACE_PHOTO:
        line['image_url'] = pl.image_url
        line['source'] = period.kind
    elif op == MenuPeriodOp.REPLACE_COPY:
        line['description_en'] = pl.description_en
        line['description_ar'] = pl.description_ar
        line['source'] = period.kind


def active_periods(menu, on):
    """The menu's periods that cover `on`, ordered low → high precedence
    (application order)."""
    covering = [p for p in menu.periods.all() if p.covers(on)]
    covering.sort(key=lambda p: (p.rank, p.starts_on, p.created_at))
    return covering


def _group(lines):
    buckets = OrderedDict()
    for line in lines:
        key = line['category'] or 'Uncategorised'
        bucket = buckets.get(key)
        if bucket is None:
            bucket = {
                'name': key,
                'name_ar': line['category_ar'],
                'order': line['category_order'],
                'items': [],
            }
            buckets[key] = bucket
        bucket['items'].append(line)
    ordered = sorted(buckets.values(), key=lambda b: (b['order'], b['name']))
    for bucket in ordered:
        bucket['items'].sort(key=lambda line: (line['sort_order'], line['name_en']))
    return ordered


def resolve_menu(menu, on):
    """The effective menu for `menu` on date `on` (a datetime.date)."""
    working = OrderedDict()
    for ml in menu.lines.select_related('dish', 'dish__category').all():
        working[str(ml.dish_id)] = _line_from_base(ml)

    applied = []
    for period in active_periods(menu, on):
        applied.append({
            'id': str(period.id),
            'kind': period.kind,
            'name_en': period.name_en,
            'name_ar': period.name_ar,
        })
        for pl in period.lines.select_related('dish', 'dish__category').all():
            _apply_op(working, pl, period)

    lines = [line for line in working.values() if not line['_removed']]
    for line in lines:
        line.pop('_removed', None)
        line['price'] = str(line['price']) if line['price'] is not None else None

    return {
        'menu_id': str(menu.id),
        'branch': {
            'id': str(menu.branch_id),
            'name_en': menu.branch.name_en,
            'name_ar': menu.branch.name_ar,
        },
        'on': on.isoformat(),
        'weekday': on.strftime('%A'),
        'periods': applied,
        'categories': _group(lines),
        'line_count': len(lines),
    }
