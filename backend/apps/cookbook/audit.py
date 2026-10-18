"""
The system-wide action log — everything that isn't an edit of a live recipe
(those keep their own Dish/ProductionRecipeActivityLog rows, see versioning.py).

Two ways in:
  - `AuditedViewSetMixin` on a ModelViewSet-shaped view: snapshots the object
    before and after perform_create / perform_update / perform_destroy and
    writes one SystemActivityLog row with the itemised before → after.
  - `record()` for custom actions (menu build, publish, user deactivate ...).

A change record is `{fields: [{field, from, to}]}` — the same shape the recipe
log uses, so the frontend's ChangeDetail renders both. Child rows (conversion
lines, modifier options, menu lines ...) are flattened into one field per row
keyed by its label, so an edit to "1 Tbs" reads as one from → to line.
An update that changes nothing writes no row.
"""
import io
import logging
import sys
from decimal import Decimal

from django.core.management.base import BaseCommand

from .models import ActivityActionType, ActivityArea, SystemActivityLog
from .versioning import _fk_label

A = ActivityActionType


def actor(request):
    return getattr(getattr(request, 'user', None), 'username', '') or ''


def _display(value):
    if value is None or value == '' or value == [] or value == {}:
        return None
    if hasattr(value, 'pk'):
        return _fk_label(value)
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    if isinstance(value, Decimal):
        return format(value.normalize(), 'f')
    return str(value)


def num(value):
    return _display(value if not isinstance(value, (int, float)) else Decimal(str(value)))


def object_state(obj, skip=()):
    """{field: display} for every concrete field + every M2M (names, sorted).
    None (no object) is an empty dict."""
    if obj is None:
        return {}
    out = {}
    for f in obj._meta.concrete_fields:
        if f.name in ('id', 'created_at', 'updated_at') or f.name in skip:
            continue
        out[f.name] = _display(getattr(obj, f.name))
    for f in obj._meta.many_to_many:
        if f.name in skip:
            continue
        names = sorted(_fk_label(o) for o in getattr(obj, f.name).all())
        out[f.name] = ', '.join(names) or None
    return out


def diff(prefix, before, after):
    rows = [
        {'field': f'{prefix}.{name}', 'from': before.get(name), 'to': after.get(name)}
        for name in {**before, **after}
        if before.get(name) != after.get(name)
    ]
    return {'fields': rows} if rows else {}


def record(request, *, area, action, subject_type, subject_id='', label='', label_ar='',
           code='', path='', description='', changes=None, branch=None, prep_kitchen=None):
    return SystemActivityLog.objects.create(
        area=area, action_type=action, subject_type=subject_type,
        subject_id=str(subject_id or ''), subject_label=(label or '')[:255],
        subject_label_ar=(label_ar or '')[:255], subject_code=(code or '')[:100],
        subject_path=(path or '')[:255], description=description,
        changed_by=actor(request) if not isinstance(request, str) else request,
        changes=changes or {}, branch_ref=branch, prep_kitchen_ref=prep_kitchen,
    )


class AuditedViewSetMixin:
    """Log create / update / delete on a DRF generic viewset.

    Subclasses set `audit_area`, `audit_subject` (subject_type) and
    `audit_prefix` (the change-record field prefix), and may override
    `audit_state(obj)` and `audit_subject_fields(obj)`.
    """
    audit_area = None
    audit_subject = None
    audit_prefix = None
    audit_skip = ()

    def audit_state(self, obj):
        return object_state(obj, skip=self.audit_skip)

    def audit_subject_fields(self, obj):
        """kwargs for record(): label / label_ar / code / path / branch / prep_kitchen."""
        return {'label': getattr(obj, 'name_en', None) or getattr(obj, 'name', None) or str(obj)}

    def _fresh(self, obj):
        # Re-read so prefetched children / M2M caches show what was saved.
        return type(obj)._default_manager.get(pk=obj.pk)

    def _audit(self, action, obj, before, after, description=''):
        changes = diff(self.audit_prefix or self.audit_subject, before, after)
        if action == A.UPDATED and not changes:
            return
        record(self.request, area=self.audit_area, action=action, subject_type=self.audit_subject,
               subject_id=obj.pk, changes=changes, description=description,
               **self.audit_subject_fields(obj))

    def perform_create(self, serializer):
        super().perform_create(serializer)
        obj = self._fresh(serializer.instance)
        after = self.audit_state(obj)
        if after.get('is_active') == 'Yes':
            del after['is_active']          # the default; only worth saying when it flips
        self._audit(A.CREATED, obj, {}, after)

    def perform_update(self, serializer):
        before = self.audit_state(self._fresh(serializer.instance))
        super().perform_update(serializer)
        obj = self._fresh(serializer.instance)
        self._audit(A.UPDATED, obj, before, self.audit_state(obj))

    def perform_destroy(self, instance):
        before = self.audit_state(instance)
        subject = self.audit_subject_fields(instance)
        pk = instance.pk
        super().perform_destroy(instance)
        record(self.request, area=self.audit_area, action=A.DELETED, subject_type=self.audit_subject,
               subject_id=pk, changes=diff(self.audit_prefix or self.audit_subject, before, {}),
               **{**subject, 'path': ''})


# ── management commands ─────────────────────────────────────────────────────

_BASE_OPTIONS = {'verbosity', 'settings', 'pythonpath', 'traceback', 'no_color', 'force_color',
                 'skip_checks', 'stdout', 'stderr'}
_OUTPUT_TAIL = 3000


class _Tee(io.TextIOBase):
    """Writes through to the real stream and keeps a copy for the log."""
    def __init__(self, primary):
        self.primary, self.copy = primary, io.StringIO()

    def write(self, s):
        self.copy.write(s)
        return self.primary.write(s)

    def flush(self):
        self.primary.flush()

    def isatty(self):
        return getattr(self.primary, 'isatty', lambda: False)()


class AuditedCommand(BaseCommand):
    """BaseCommand that logs each run (imports, bulk publishes, syncs, seeds,
    the digest cron ...) as one SystemActivityLog row: the arguments, whether
    it succeeded, and the tail of its output. Logging never breaks the
    command — an audit write failure is swallowed (logged to stderr)."""

    def execute(self, *args, **options):
        tee = _Tee(options.get('stdout') or sys.stdout)
        options['stdout'] = tee
        name = type(self).__module__.rsplit('.', 1)[-1]
        argv = [str(a) for a in args] + [
            f'--{k.replace("_", "-")}' + ('' if v is True else f'={v}')
            for k, v in sorted(options.items())
            if k not in _BASE_OPTIONS and v not in (None, False, '', [], ())
        ]
        try:
            result = super().execute(*args, **options)
        except BaseException as e:
            self._audit(name, argv, tee, failed=f'{type(e).__name__}: {e}')
            raise
        # a scheduled run that found nothing to do may opt out (failures never can)
        if not getattr(self, 'audit_skip', False):
            self._audit(name, argv, tee)
        return result

    @staticmethod
    def _audit(name, argv, tee, failed=''):
        output = tee.copy.getvalue().strip()
        if len(output) > _OUTPUT_TAIL:
            output = '…' + output[-_OUTPUT_TAIL:]
        fields = [{'field': 'command.output', 'from': None, 'to': output}] if output else []
        if failed:
            fields.insert(0, {'field': 'command.error', 'from': None, 'to': failed[:1000]})
        try:
            record('system', area=ActivityArea.SYSTEM,
                   action=ActivityActionType.COMMAND_FAILED if failed else ActivityActionType.COMMAND_RUN,
                   subject_type='command', label=name, code=name,
                   description=' '.join(['manage.py', name, *argv])[:2000],
                   changes={'fields': fields} if fields else None)
        except Exception:  # never fail the command over its audit row
            logging.getLogger(__name__).exception('could not log the %s run', name)
