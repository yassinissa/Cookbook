"""
Activity & History feed — `/api/cookbook/activity/`.

The "Action Log" sheet replacement: one chronological, filterable stream
merged from DishRecipeActivityLog + ProductionRecipeActivityLog. Read-only,
no new tables. Dish activity is branch-scoped; production activity is
prep-kitchen-scoped and only shown to callers with `production.view`.

Volume is modest (one row per recipe create / edit / recalculate / QA
action), so the merge is done in Python: filter both querysets, materialise,
sort by created_at, slice the page. Swap for a SQL UNION if the log ever
grows past tens of thousands of rows.
"""
from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import ALL, access_for
from apps.accounts.permissions import capability_required

from .models import (
    ActivityActionType, DishRecipeActivityLog, ProductionRecipeActivityLog,
)

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 30


def _entry(kind, log):
    recipe = log.recipe
    if kind == 'dish':
        scope_name = (recipe.branch_ref.name_en if recipe.branch_ref_id else recipe.branch) or None
        recipe_path = f'/recipes/dishes/{recipe.id}'
    else:
        scope_name = (recipe.prep_kitchen_ref.name_en if recipe.prep_kitchen_ref_id
                      else recipe.prep_kitchen) or None
        recipe_path = f'/recipes/production/{recipe.id}'
    return {
        'id': str(log.id),
        'kind': kind,
        'action': log.action_type,
        'action_display': log.get_action_type_display(),
        'description': log.description,
        'recipe_id': str(log.recipe_id),
        'recipe_name': recipe.name_en,
        'recipe_name_ar': recipe.name_ar,
        'recipe_code': recipe.recipe_code,
        'recipe_path': recipe_path,
        'scope_name': scope_name,
        'changed_by': log.changed_by or None,
        'created_at': log.created_at.isoformat(),
    }


class ActivityFeedView(APIView):
    permission_classes = [capability_required(default='activity.view')]

    def get(self, request):
        access = access_for(request)
        p = request.query_params

        try:
            page = max(1, int(p.get('page', 1)))
            page_size = min(MAX_PAGE_SIZE, max(1, int(p.get('page_size', DEFAULT_PAGE_SIZE))))
        except ValueError:
            raise ValidationError('page and page_size must be integers.')

        kind = p.get('kind') or None
        if kind not in (None, 'dish', 'production'):
            raise ValidationError({'kind': 'Must be "dish" or "production".'})

        actions = [a for a in p.get('action', '').split(',') if a] or None
        valid_actions = set(ActivityActionType.values)
        if actions and not set(actions) <= valid_actions:
            raise ValidationError({'action': f'Unknown action(s): {set(actions) - valid_actions}'})

        actor = p.get('actor') or None
        recipe_id = p.get('recipe') or None
        query = (p.get('q') or '').strip()

        date_from = _parse_day(p.get('date_from'), end=False)
        date_to = _parse_day(p.get('date_to'), end=True)

        def apply_common(qs):
            if actions:
                qs = qs.filter(action_type__in=actions)
            if actor:
                qs = qs.filter(changed_by=actor)
            if recipe_id:
                qs = qs.filter(recipe_id=recipe_id)
            if query:
                qs = qs.filter(recipe__name_en__icontains=query)
            if date_from:
                qs = qs.filter(created_at__gte=date_from)
            if date_to:
                qs = qs.filter(created_at__lte=date_to)
            return qs

        rows = []
        actors = set()

        if kind in (None, 'dish'):
            dish_qs = DishRecipeActivityLog.objects.select_related('recipe', 'recipe__branch_ref')
            if not access.is_superuser and access.scope.branch_ids is not ALL:
                ids = list(access.scope.branch_ids)
                dish_qs = dish_qs.filter(recipe__branch_ref_id__in=ids) if ids else dish_qs.none()
            dish_qs = apply_common(dish_qs)
            actors |= set(dish_qs.exclude(changed_by='').values_list('changed_by', flat=True))
            rows += [('dish', log) for log in dish_qs]

        if kind in (None, 'production') and access.can('production.view'):
            prod_qs = ProductionRecipeActivityLog.objects.select_related(
                'recipe', 'recipe__prep_kitchen_ref')
            if not access.is_superuser and access.scope.prep_kitchen_ids is not ALL:
                ids = list(access.scope.prep_kitchen_ids)
                prod_qs = (prod_qs.filter(recipe__prep_kitchen_ref_id__in=ids) if ids
                           else prod_qs.none())
            prod_qs = apply_common(prod_qs)
            actors |= set(prod_qs.exclude(changed_by='').values_list('changed_by', flat=True))
            rows += [('production', log) for log in prod_qs]

        rows.sort(key=lambda t: t[1].created_at, reverse=True)

        count = len(rows)
        num_pages = max(1, -(-count // page_size))
        start = (page - 1) * page_size
        page_rows = rows[start:start + page_size]

        return Response({
            'count': count,
            'page': page,
            'page_size': page_size,
            'num_pages': num_pages,
            'results': [_entry(kind_, log) for kind_, log in page_rows],
            'actors': sorted(actors),
            'action_types': [
                {'value': v, 'label': l}
                for v, l in ActivityActionType.choices
            ],
        })


def _parse_day(value, *, end):
    if not value:
        return None
    d = parse_date(value)
    if d is None:
        raise ValidationError('Dates must be ISO (YYYY-MM-DD).')
    naive = datetime.combine(d, time.max if end else time.min)
    return timezone.make_aware(naive) if timezone.is_naive(naive) else naive
