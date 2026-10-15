"""
Activity & History feed — `/api/cookbook/activity/` (+ `export/`).

The "Action Log" sheet replacement: one chronological, filterable stream
merged from three logs —
  - DishRecipeActivityLog / ProductionRecipeActivityLog (recipe edits,
    recalculations, QA, plating, publishes), and
  - SystemActivityLog (everything else: inventory-item supplements, menus,
    specials, POS modifiers, branches, prep kitchens, users, roles, recipe
    deletes, sign-ins, management-command runs — written by
    `apps.cookbook.audit` / `apps.cookbook.signals`), and
  - Django's own admin LogEntry (reference data edited at /admin/).

Who sees what: dish rows are branch-scoped; production rows are
prep-kitchen-scoped and need `production.view`; item rows need
`inventory.view`, menu rows `menu.view` (+ branch scope), POS rows
`pos.manage`, admin + system rows (and Django-admin edits) any `admin.*`
capability, sign-ins `admin.users`. Money fields are stripped
from the change record without `costing.view`.

Volume is modest, so the merge is done in Python: filter each queryset,
materialise, sort by created_at, slice the page. Swap for a SQL UNION if the
log ever grows past tens of thousands of rows. The export walks the same
filtered rows, unpaged, into an .xlsx (or .csv) the caller downloads.
"""
import csv
import io
from datetime import datetime, time

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import ALL, access_for
from apps.accounts.permissions import capability_required

from .models import (
    ActivityActionType, ActivityArea, DishRecipeActivityLog, ProductionRecipeActivityLog,
    SystemActivityLog,
)
from .versioning import COSTING_FIELDS, has_changes, strip_costing

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 30
MAX_EXPORT_ROWS = 50_000

ADMIN_CAPS = ('admin.users', 'admin.roles', 'admin.branches', 'admin.prep_kitchens')

SUBJECT_TYPES = {
    'dish_recipe': 'Dish recipe',
    'production_recipe': 'Production recipe',
    'item_conversion': 'Item conversions & cost',
    'item_nutrition': 'Item nutrition',
    'item_storage': 'Item storage & shelf life',
    'menu': 'Menu',
    'menu_line': 'Menu dish',
    'menu_period': 'Special / menu period',
    'modifier_group': 'Modifier group',
    'dish_modifiers': 'Dish modifiers',
    'branch': 'Branch',
    'prep_kitchen': 'Prep kitchen',
    'user': 'User',
    'role': 'Role',
    'digest_subscription': 'Cost digest setting',
    'command': 'Management command',
    'django_admin': 'Django admin',
}

_ADMIN_FLAG_ACTION = {ADDITION: 'created', CHANGE: 'updated', DELETION: 'deleted'}
_ACTION_ADMIN_FLAG = {v: k for k, v in _ADMIN_FLAG_ACTION.items()}

# Money in a system change record — the last segment of `<prefix>.<field>`.
_SYSTEM_COSTING = COSTING_FIELDS | {'cost_per_base_unit', 'order_cost', 'menu_price'}


def _entry(kind, log):
    """A recipe-log row (dish / production) in the feed's shape."""
    recipe = log.recipe
    if kind == 'dish':
        scope_name = recipe.branch_ref.name_en if recipe.branch_ref_id else None
        recipe_path = f'/recipes/dishes/{recipe.id}'
    else:
        scope_name = (recipe.prep_kitchen_ref.name_en if recipe.prep_kitchen_ref_id
                      else recipe.prep_kitchen) or None
        recipe_path = f'/recipes/production/{recipe.id}'
    subject_type = 'dish_recipe' if kind == 'dish' else 'production_recipe'
    return {
        'id': str(log.id),
        'kind': kind,
        'kind_display': ActivityArea(kind).label,
        'action': log.action_type,
        'action_display': log.get_action_type_display(),
        'description': log.description,
        'subject_type': subject_type,
        'subject_type_display': SUBJECT_TYPES[subject_type],
        'recipe_id': str(log.recipe_id),
        'recipe_name': recipe.name_en,
        'recipe_name_ar': recipe.name_ar,
        'recipe_code': recipe.recipe_code,
        'recipe_path': recipe_path,
        'scope_name': scope_name,
        'changed_by': log.changed_by or None,
        'created_at': log.created_at.isoformat(),
    }


def _system_entry(log):
    """A SystemActivityLog row in the same shape — `recipe_*` carry the
    subject, whatever it is, so every consumer renders it unchanged."""
    scope = log.branch_ref or log.prep_kitchen_ref
    return {
        'id': str(log.id),
        'kind': log.area,
        'kind_display': log.get_area_display(),
        'action': log.action_type,
        'action_display': log.get_action_type_display(),
        'description': log.description,
        'subject_type': log.subject_type,
        'subject_type_display': SUBJECT_TYPES.get(log.subject_type, log.subject_type),
        'recipe_id': log.subject_id,
        'recipe_name': log.subject_label or log.subject_code,
        'recipe_name_ar': log.subject_label_ar,
        'recipe_code': log.subject_code,
        'recipe_path': log.subject_path or None,
        'scope_name': scope.name_en if scope else None,
        'changed_by': log.changed_by or None,
        'created_at': log.created_at.isoformat(),
    }


def _django_admin_entry(log):
    """A Django-admin LogEntry (reference data edited at /admin/) in the same shape."""
    action = _ADMIN_FLAG_ACTION.get(log.action_flag, 'updated')
    model = log.content_type.name if log.content_type_id else 'record'
    return {
        'id': f'admin-{log.pk}',
        'kind': ActivityArea.ADMIN,
        'kind_display': ActivityArea.ADMIN.label,
        'action': action,
        'action_display': ActivityActionType(action).label,
        'description': log.get_change_message() or '',
        'subject_type': 'django_admin',
        'subject_type_display': f'{model[:1].upper()}{model[1:]} (Django admin)',
        'recipe_id': log.object_id or '',
        'recipe_name': log.object_repr,
        'recipe_name_ar': '',
        'recipe_code': '',
        'recipe_path': None,
        'scope_name': None,
        'changed_by': log.user.username if log.user_id else None,
        'created_at': log.action_time.isoformat(),
    }


def when(log):
    return log.action_time if isinstance(log, LogEntry) else log.created_at


def _strip_system_costing(changes):
    if not changes:
        return changes
    return {**changes, 'fields': [
        f for f in changes.get('fields', []) if f['field'].rsplit('.', 1)[-1] not in _SYSTEM_COSTING
    ]}


def scoped_log_querysets(access, kind=None):
    """[(kind, queryset)] of the recipe-log rows this caller may see: dish
    activity within their branches, production activity within their prep
    kitchens and only with `production.view`. Shared with the recipe change feed."""
    out = []
    if kind in (None, 'dish'):
        dish_qs = DishRecipeActivityLog.objects.select_related('recipe', 'recipe__branch_ref')
        if not access.is_superuser and access.scope.branch_ids is not ALL:
            ids = list(access.scope.branch_ids)
            dish_qs = dish_qs.filter(recipe__branch_ref_id__in=ids) if ids else dish_qs.none()
        out.append(('dish', dish_qs))
    if kind in (None, 'production') and access.can('production.view'):
        prod_qs = ProductionRecipeActivityLog.objects.select_related(
            'recipe', 'recipe__prep_kitchen_ref')
        if not access.is_superuser and access.scope.prep_kitchen_ids is not ALL:
            ids = list(access.scope.prep_kitchen_ids)
            prod_qs = (prod_qs.filter(recipe__prep_kitchen_ref_id__in=ids) if ids
                       else prod_qs.none())
        out.append(('production', prod_qs))
    return out


def scoped_system_queryset(access, kind=None):
    """The SystemActivityLog rows this caller may see (see module docstring)."""
    qs = SystemActivityLog.objects.select_related('branch_ref', 'prep_kitchen_ref')
    if kind:
        qs = qs.filter(area=kind)
    if access.is_superuser:
        return qs
    areas = [ActivityArea.DISH]
    if access.can('production.view'):
        areas.append(ActivityArea.PRODUCTION)
    if access.can('inventory.view'):
        areas.append(ActivityArea.ITEM)
    if access.can('menu.view'):
        areas.append(ActivityArea.MENU)
    if access.can('pos.manage'):
        areas.append(ActivityArea.POS)
    if any(access.can(c) for c in ADMIN_CAPS):
        areas += [ActivityArea.ADMIN, ActivityArea.SYSTEM]
    if access.can('admin.users'):
        areas.append(ActivityArea.AUTH)
    qs = qs.filter(area__in=areas)
    if access.scope.branch_ids is not ALL:
        qs = qs.filter(Q(branch_ref__isnull=True) | Q(branch_ref_id__in=list(access.scope.branch_ids)))
    if access.scope.prep_kitchen_ids is not ALL:
        qs = qs.filter(Q(prep_kitchen_ref__isnull=True)
                       | Q(prep_kitchen_ref_id__in=list(access.scope.prep_kitchen_ids)))
    return qs


def collect_activity(request):
    """Every feed row the caller may see that matches the query filters, newest
    first, as [(source, log)] where source is 'dish' / 'production' / 'system'.
    Also returns the actor list for the filter."""
    access = access_for(request)
    p = request.query_params

    kind = p.get('kind') or None
    if kind not in (None, *ActivityArea.values):
        raise ValidationError({'kind': f'Must be one of {ActivityArea.values}.'})

    actions = [a for a in p.get('action', '').split(',') if a] or None
    valid_actions = set(ActivityActionType.values)
    if actions and not set(actions) <= valid_actions:
        raise ValidationError({'action': f'Unknown action(s): {set(actions) - valid_actions}'})

    actor = p.get('actor') or None
    subject_id = p.get('recipe') or None
    query = (p.get('q') or '').strip()
    date_from = _parse_day(p.get('date_from'), end=False)
    date_to = _parse_day(p.get('date_to'), end=True)

    def common(qs):
        if actions:
            qs = qs.filter(action_type__in=actions)
        if actor:
            qs = qs.filter(changed_by=actor)
        if date_from:
            qs = qs.filter(created_at__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__lte=date_to)
        return qs

    rows, actors = [], set()

    recipe_sources = scoped_log_querysets(access, kind) if kind in (None, 'dish', 'production') else []
    for kind_, qs in recipe_sources:
        qs = common(qs)
        if subject_id:
            qs = qs.filter(recipe_id=subject_id)
        if query:
            qs = qs.filter(Q(recipe__name_en__icontains=query) | Q(recipe__name_ar__icontains=query)
                           | Q(recipe__recipe_code__icontains=query) | Q(description__icontains=query))
        actors |= set(qs.exclude(changed_by='').values_list('changed_by', flat=True))
        rows += [(kind_, log) for log in qs]

    sys_qs = common(scoped_system_queryset(access, kind))
    if subject_id:
        sys_qs = sys_qs.filter(subject_id=subject_id)
    if query:
        sys_qs = sys_qs.filter(
            Q(subject_label__icontains=query) | Q(subject_label_ar__icontains=query)
            | Q(subject_code__icontains=query) | Q(description__icontains=query))
    actors |= set(sys_qs.exclude(changed_by='').values_list('changed_by', flat=True))
    rows += [('system', log) for log in sys_qs]

    # Django admin edits (reference data). Admin-capable callers only.
    if kind in (None, ActivityArea.ADMIN) and (
            access.is_superuser or any(access.can(c) for c in ADMIN_CAPS)):
        adm = LogEntry.objects.select_related('user', 'content_type')
        if actions:
            flags = [_ACTION_ADMIN_FLAG[a] for a in actions if a in _ACTION_ADMIN_FLAG]
            adm = adm.filter(action_flag__in=flags)
        if actor:
            adm = adm.filter(user__username=actor)
        if date_from:
            adm = adm.filter(action_time__gte=date_from)
        if date_to:
            adm = adm.filter(action_time__lte=date_to)
        if subject_id:
            adm = adm.filter(object_id=subject_id)
        if query:
            adm = adm.filter(Q(object_repr__icontains=query) | Q(change_message__icontains=query))
        actors |= set(adm.values_list('user__username', flat=True))
        rows += [('django_admin', log) for log in adm]

    rows.sort(key=lambda t: when(t[1]), reverse=True)
    return rows, actors, access


def feed_entry(source, log, *, can_cost):
    if source == 'django_admin':
        return {**_django_admin_entry(log), 'changes': None}
    if source == 'system':
        entry = _system_entry(log)
        changes = log.changes if can_cost else _strip_system_costing(log.changes)
        if changes and not changes.get('fields'):
            changes = None
    else:
        entry = _entry(source, log)
        changes = log.changes if can_cost else strip_costing(log.changes)
        if not has_changes(changes):
            changes = None
    entry['changes'] = changes or None
    return entry


class ActivityFeedView(APIView):
    permission_classes = [capability_required(default='activity.view')]

    def get(self, request):
        p = request.query_params
        try:
            page = max(1, int(p.get('page', 1)))
            page_size = min(MAX_PAGE_SIZE, max(1, int(p.get('page_size', DEFAULT_PAGE_SIZE))))
        except ValueError:
            raise ValidationError('page and page_size must be integers.')

        rows, actors, access = collect_activity(request)
        can_cost = access.can('costing.view')

        count = len(rows)
        num_pages = max(1, -(-count // page_size))
        start = (page - 1) * page_size
        page_rows = rows[start:start + page_size]

        return Response({
            'count': count,
            'page': page,
            'page_size': page_size,
            'num_pages': num_pages,
            'results': [feed_entry(s, log, can_cost=can_cost) for s, log in page_rows],
            'actors': sorted(actors),
            'kinds': [{'value': v, 'label': l} for v, l in ActivityArea.choices],
            'action_types': [
                {'value': v, 'label': l}
                for v, l in ActivityActionType.choices
            ],
        })


# ── export ─────────────────────────────────────────────────────────────────

def _ingredient_text(line):
    if not line:
        return None
    name = line.get('item_name_snapshot') or line.get('item_sku')
    unit = f" {line['unit']}" if line.get('unit') else ''
    return f"{line.get('quantity')}{unit} {name}".strip()


def flatten_changes(changes):
    """[(what, from, to)] for any change record — recipe diffs (fields,
    ingredients, method, allergens) and system records (fields) alike."""
    if not changes:
        return []
    out = [(f['field'], f.get('from'), f.get('to')) for f in changes.get('fields', [])]
    ing = changes.get('ingredients') or {}
    out += [('ingredient added', None, _ingredient_text(l)) for l in ing.get('added', [])]
    out += [('ingredient removed', _ingredient_text(l), None) for l in ing.get('removed', [])]
    out += [(f"ingredient {c.get('label')}", _ingredient_text(c.get('from')), _ingredient_text(c.get('to')))
            for c in ing.get('changed', [])]
    if ing.get('reordered'):
        out.append(('ingredients', None, 're-ordered'))
    steps = changes.get('steps') or {}
    out += [('method step added', None, s) for s in steps.get('added', [])]
    out += [('method step removed', s, None) for s in steps.get('removed', [])]
    out += [(f"method step {c.get('n')}", c.get('from'), c.get('to')) for c in steps.get('changed', [])]
    alg = changes.get('allergens') or {}
    out += [('allergen added', None, a) for a in alg.get('added', [])]
    out += [('allergen removed', a, None) for a in alg.get('removed', [])]
    return out


def _field_label(field):
    return field.replace('.', ' · ').replace('_', ' ')


ACTIVITY_COLUMNS = [
    ('Date', 12), ('Time', 9), ('Area', 16), ('Action', 20), ('What', 24), ('Name', 34),
    ('Code / SKU', 16), ('Branch / kitchen', 18), ('Changed by', 16), ('Description', 40),
    ('Changes', 70),
]
CHANGE_COLUMNS = [
    ('Date', 12), ('Time', 9), ('Area', 16), ('Name', 34), ('Code / SKU', 16), ('Action', 20),
    ('Changed by', 16), ('Field', 30), ('From', 34), ('To', 34),
]


def _export_rows(rows, can_cost):
    """(activity rows, field-change rows) as plain lists for the sheet."""
    activity, field_rows = [], []
    for source, log in rows:
        e = feed_entry(source, log, can_cost=can_cost)
        local = timezone.localtime(when(log))
        day, clock = local.strftime('%Y-%m-%d'), local.strftime('%H:%M')
        flat = flatten_changes(e['changes'])
        activity.append([
            day, clock, e['kind_display'], e['action_display'], e['subject_type_display'],
            e['recipe_name'], e['recipe_code'] or '', e['scope_name'] or '', e['changed_by'] or '',
            e['description'] or '',
            '\n'.join(f"{_field_label(w)}: {a if a is not None else '—'} → {b if b is not None else '—'}"
                      for w, a, b in flat),
        ])
        for w, a, b in flat:
            field_rows.append([
                day, clock, e['kind_display'], e['recipe_name'], e['recipe_code'] or '',
                e['action_display'], e['changed_by'] or '', _field_label(w),
                '' if a is None else str(a), '' if b is None else str(b),
            ])
    return activity, field_rows


def _xlsx(activity, field_rows, title):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    head_font = Font(bold=True, color='FFFFFF')
    head_fill = PatternFill('solid', fgColor='7A3A17')
    wrap = Alignment(wrap_text=True, vertical='top')

    def sheet(ws, columns, data):
        ws.append([c for c, _ in columns])
        for i, (_, width) in enumerate(columns, start=1):
            cell = ws.cell(row=1, column=i)
            cell.font, cell.fill = head_font, head_fill
            ws.column_dimensions[cell.column_letter].width = width
        for row in data:
            ws.append(row)
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = wrap
        ws.freeze_panes = 'A2'
        ws.auto_filter.ref = ws.dimensions

    ws = wb.active
    ws.title = 'Activity'
    sheet(ws, ACTIVITY_COLUMNS, activity)
    sheet(wb.create_sheet('Field changes'), CHANGE_COLUMNS, field_rows)
    wb.properties.title = title
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class ActivityExportView(APIView):
    """GET /api/cookbook/activity/export/?file=xlsx|csv + the feed's filters.
    Every matching row (no paging), in the caller's scope. The .xlsx has two
    sheets: one row per action, and one row per changed field. (`file`, not
    `format` — DRF reserves `format` for content negotiation.)"""
    permission_classes = [capability_required(default='activity.view')]

    def get(self, request):
        kind = request.query_params.get('file', 'xlsx')
        if kind not in ('xlsx', 'csv'):
            raise ValidationError({'file': 'Must be "xlsx" or "csv".'})
        rows, _, access = collect_activity(request)
        if len(rows) > MAX_EXPORT_ROWS:
            raise ValidationError(
                f'{len(rows)} rows match — narrow the dates or filters to under {MAX_EXPORT_ROWS}.')
        activity, field_rows = _export_rows(rows, access.can('costing.view'))
        stamp = timezone.localtime().strftime('%Y-%m-%d_%H%M')

        if kind == 'csv':
            buf = io.StringIO()
            buf.write('﻿')   # so Excel opens the Arabic names as UTF-8
            writer = csv.writer(buf)
            writer.writerow([c for c, _ in ACTIVITY_COLUMNS])
            writer.writerows(activity)
            resp = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
            resp['Content-Disposition'] = f'attachment; filename="cookbook-activity_{stamp}.csv"'
            return resp

        body = _xlsx(activity, field_rows, f'Cookbook activity {stamp}')
        resp = HttpResponse(
            body, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        resp['Content-Disposition'] = f'attachment; filename="cookbook-activity_{stamp}.xlsx"'
        return resp


def _parse_day(value, *, end):
    if not value:
        return None
    d = parse_date(value)
    if d is None:
        raise ValidationError('Dates must be ISO (YYYY-MM-DD).')
    naive = datetime.combine(d, time.max if end else time.min)
    return timezone.make_aware(naive) if timezone.is_naive(naive) else naive
