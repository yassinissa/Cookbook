"""
Specials-calendar API.

  /api/cookbook/menu-periods/          CRUD on MenuPeriod (+ nested line ops)
  /api/cookbook/menus/<id>/effective/  the resolved menu for ?on=YYYY-MM-DD

A period belongs to one branch Menu; access + scope mirror MenuViewSet
(branch-scoped, menu.view to read / menu.edit to write). Editing a period is
never a recipe edit and never touches costing.
"""
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from apps.accounts.access import ALL, access_for
from apps.accounts.permissions import capability_required

from .audit import AuditedViewSetMixin, num
from .models import ActivityArea, Menu, MenuPeriod
from .serializers.specials import MenuPeriodSerializer, MenuPeriodWriteSerializer


def menus_in_scope(request):
    qs = Menu.objects.select_related('branch')
    access = access_for(request)
    if access.is_superuser or access.scope.branch_ids is ALL:
        return qs
    if not access.scope.branch_ids:
        return qs.none()
    return qs.filter(branch_id__in=list(access.scope.branch_ids))


class MenuPeriodViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_area, audit_subject, audit_prefix = ActivityArea.MENU, 'menu_period', 'special'

    def audit_subject_fields(self, obj):
        return {'label': obj.name_en, 'label_ar': obj.name_ar,
                'path': f'/menus/{obj.menu.branch_id}', 'branch': obj.menu.branch}

    def audit_state(self, obj):
        state = super().audit_state(obj)
        for line in obj.lines.select_related('dish').all():
            bits = [b for b in (
                num(line.menu_price) and f'{num(line.menu_price)} KWD', line.pos_name,
                line.description_en, line.image_url and 'photo') if b]
            state[f'{line.get_op_display().lower()} {line.dish.name_en}'] = ' / '.join(bits) or 'yes'
        return state

    permission_classes = [capability_required(default='menu.view', by_action={
        'list': 'menu.view', 'retrieve': 'menu.view',
        'create': 'menu.edit', 'update': 'menu.edit',
        'partial_update': 'menu.edit', 'destroy': 'menu.edit',
    })]
    pagination_class = None
    serializer_class = MenuPeriodSerializer

    def get_queryset(self):
        qs = (MenuPeriod.objects
              .select_related('menu', 'menu__branch')
              .prefetch_related('lines__dish__category')
              .filter(menu__in=menus_in_scope(self.request)))
        menu_id = self.request.query_params.get('menu')
        if menu_id:
            qs = qs.filter(menu_id=menu_id)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return MenuPeriodWriteSerializer
        return MenuPeriodSerializer

    def _resolve_menu_param(self):
        menu_id = self.request.data.get('menu')
        if not menu_id:
            raise ValidationError({'menu': 'This field is required.'})
        menu = menus_in_scope(self.request).filter(id=menu_id).first()
        if menu is None:
            raise ValidationError({'menu': 'Unknown menu, or outside your branch scope.'})
        return menu

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == 'create':
            ctx['menu'] = self._resolve_menu_param()
        return ctx
