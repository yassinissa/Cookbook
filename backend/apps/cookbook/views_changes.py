"""
Recipe change history — `/api/cookbook/recipe-changes/`.

The audit trail for the recipes themselves: every create / edit /
recalculation, each with who did it, when, and the itemised before → after
(`changes`, written by the save path — see `versioning.diff_states`). Two kinds
of entry, deliberately distinct:

  * a **version** — the ingredients, method or yield changed, so the recipe
    got a new version number (`is_new_version`);
  * an **adjustment** — anything else (price, name, station, notes, a cost
    recalculation): logged in full, version unchanged.

Reads the same two `*ActivityLog` tables as the Activity feed (same scoping),
so there is one source of truth. `?recipe=<id>&all=1` is the full per-recipe
timeline (adds publish / QA / plating events) for the drawer on a recipe page.
Money fields are stripped for callers without `costing.view`.
"""
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import access_for
from apps.accounts.permissions import capability_required

from .models import ActivityActionType, DishRecipe, ProductionRecipe
from .versioning import diff_recipes, has_changes, strip_costing, summarize
from .views_activity import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, _entry, _parse_day, scoped_log_querysets

# what counts as "the recipe changed" (vs. the wider activity feed)
CHANGE_ACTIONS = [
    ActivityActionType.CREATED, ActivityActionType.UPDATED, ActivityActionType.RECALCULATED,
]
_MODELS = {'dish': DishRecipe, 'production': ProductionRecipe}
_VIEW_CAP = {'dish': 'dish.view', 'production': 'production.view'}


def _legacy_changes(kind, log):
    """Version rows logged before `changes` existed: rebuild the diff from the
    archived snapshots either side of that version."""
    rows = {
        r.version: r for r in
        _MODELS[kind].objects.filter(lineage_key=log.recipe.lineage_key,
                                     version__in=[log.version - 1, log.version])
        .order_by('is_current')          # the live row wins a tie
    }
    if len(rows) < 2:
        return {}
    return diff_recipes(rows[log.version - 1], rows[log.version])


def change_entry(kind, log, *, can_cost, names):
    changes, reconstructed = log.changes or {}, False
    if (not changes and log.is_new_version and log.version and log.version > 1
            and log.action_type == ActivityActionType.UPDATED):
        changes, reconstructed = _legacy_changes(kind, log), True
    if not can_cost:
        changes = strip_costing(changes)
    return {
        **_entry(kind, log),
        'changed_by_name': names.get(log.changed_by) or None,
        'version': log.version,
        'is_new_version': log.is_new_version,
        'changes': changes if has_changes(changes) else None,
        'changes_reconstructed': reconstructed,
        'summary': summarize(changes),
    }


class RecipeChangeFeedView(APIView):
    permission_classes = [capability_required(default='recipe.history')]

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
        change_type = p.get('type') or None
        if change_type not in (None, 'version', 'adjustment'):
            raise ValidationError({'type': 'Must be "version" or "adjustment".'})

        actor = p.get('actor') or None
        recipe_id = p.get('recipe') or None
        query = (p.get('q') or '').strip()
        date_from = _parse_day(p.get('date_from'), end=False)
        date_to = _parse_day(p.get('date_to'), end=True)
        everything = p.get('all') == '1'

        rows, actors = [], set()
        for kind_, qs in scoped_log_querysets(access, kind):
            if not access.can(_VIEW_CAP[kind_]):
                continue
            if not everything:
                qs = qs.filter(action_type__in=CHANGE_ACTIONS)
            if change_type == 'version':
                qs = qs.filter(is_new_version=True)
            elif change_type == 'adjustment':
                qs = qs.filter(is_new_version=False)
            if recipe_id:
                qs = qs.filter(recipe_id=recipe_id)
            if query:
                qs = qs.filter(Q(recipe__name_en__icontains=query) | Q(recipe__name_ar__icontains=query)
                               | Q(recipe__recipe_code__icontains=query))
            if date_from:
                qs = qs.filter(created_at__gte=date_from)
            if date_to:
                qs = qs.filter(created_at__lte=date_to)
            # the "by" options list everyone in view, not just the one picked
            actors |= set(qs.exclude(changed_by='').values_list('changed_by', flat=True))
            if actor:
                qs = qs.filter(changed_by=actor)
            rows += [(kind_, log) for log in qs]

        rows.sort(key=lambda t: t[1].created_at, reverse=True)
        count = len(rows)
        start = (page - 1) * page_size
        page_rows = rows[start:start + page_size]

        names = {
            u.username: u.get_full_name()
            for u in get_user_model().objects.filter(username__in=actors)
        }
        can_cost = access.can('costing.view')
        return Response({
            'count': count,
            'page': page,
            'page_size': page_size,
            'num_pages': max(1, -(-count // page_size)),
            'versions': sum(1 for _, log in rows if log.is_new_version),
            'results': [change_entry(k, log, can_cost=can_cost, names=names) for k, log in page_rows],
            'actors': [{'username': a, 'name': names.get(a) or a} for a in sorted(actors)],
        })
