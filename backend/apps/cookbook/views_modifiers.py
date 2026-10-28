"""
POS modifier API.

  /api/cookbook/modifier-groups/       the global group + option catalogue
  /api/cookbook/dish-modifiers/        which groups hang off a dish — addressed
                                       by dish id, same shape as plating-guides /
                                       dish-standards
  /api/cookbook/modifier-readiness/    every option across every group with its
                                       consumption-effect status — the worklist

All gated `pos.manage`. Attaching a modifier never versions the recipe and
never re-runs costing.
"""
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import ScopedQuerySetMixin, capability_required

from .audit import AuditedViewSetMixin, num, record
from .modifier_rules import group_rule_issues
from .models import ActivityActionType, ActivityArea, DishRecipe, ModifierGroup, ModifierOption
from .serializers.modifiers import (
    ModifierGroupSerializer, ModifierGroupWriteSerializer,
    DishModifierListSerializer, DishModifierDetailSerializer, DishModifierWriteSerializer,
)


class ModifierGroupViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_area, audit_subject, audit_prefix = ActivityArea.POS, 'modifier_group', 'modifier'

    def audit_subject_fields(self, obj):
        return {'label': obj.name_en, 'label_ar': obj.name_ar, 'path': '/pos'}

    def audit_state(self, obj):
        state = super().audit_state(obj)
        for opt in obj.options.select_related('variant_recipe', 'unit').prefetch_related('deltas__unit'):
            bits = [opt.get_kind_display(), f'+{num(opt.price_delta) or 0} KWD']
            if opt.pos_mods_string:
                bits.append(f'POS "{opt.pos_mods_string}"')
            if opt.variant_recipe_id:
                bits.append(f'variant {opt.variant_recipe.name_en}')
            if opt.item_sku:
                unit = opt.unit.code if opt.unit else ''
                bits.append(f'{num(opt.quantity) or ""} {unit} {opt.item_sku}'.strip())
            for d in opt.deltas.all():
                unit = d.unit.code if d.unit else ''
                bits.append(f'{d.direction} {num(d.quantity)} {unit} {d.item_name_snapshot or d.item_sku}')
            if opt.no_consumption_impact:
                bits.append('no stock impact')
            if not opt.is_available:
                bits.append('unavailable')
            state[f'option {opt.name_en}'] = ' / '.join(bits)
        return state

    permission_classes = [capability_required(default='pos.manage')]
    pagination_class = None
    queryset = (ModifierGroup.objects
                .prefetch_related('options', 'options__unit', 'options__variant_recipe', 'dish_uses')
                .order_by('name_en'))

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ModifierGroupWriteSerializer
        return ModifierGroupSerializer


class DishModifierViewSet(
    ScopedQuerySetMixin,
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    scope_kind = 'branch'
    scope_field = 'branch_ref_id'
    permission_classes = [capability_required(default='pos.manage')]
    pagination_class = None
    queryset = (DishRecipe.objects.filter(is_current=True)
                .select_related('category', 'branch_ref')
                .prefetch_related('modifier_groups__group__options')
                .order_by('name_en'))

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DishModifierDetailSerializer
        return DishModifierListSerializer

    @staticmethod
    def _groups(dish):
        return {f'group {g.group.name_en}': g.get_default_role_display()
                for g in dish.modifier_groups.select_related('group').all()}

    def update(self, request, *args, **kwargs):
        dish = self.get_object()
        before = self._groups(dish)
        writer = DishModifierWriteSerializer(data=request.data)
        writer.is_valid(raise_exception=True)
        writer.save(dish=dish)
        dish.refresh_from_db()
        after = self._groups(dish)
        rows = [{'field': f'dish_modifiers.{k}', 'from': before.get(k), 'to': after.get(k)}
                for k in {**before, **after} if before.get(k) != after.get(k)]
        if rows:
            record(request, area=ActivityArea.POS, action=ActivityActionType.UPDATED,
                   subject_type='dish_modifiers', subject_id=dish.pk, label=dish.name_en,
                   label_ar=dish.name_ar, code=dish.recipe_code,
                   path=f'/recipes/dishes/{dish.pk}', changes={'fields': rows},
                   description='Modifier groups on this dish changed', branch=dish.branch_ref)
        out = DishModifierDetailSerializer(dish, context=self.get_serializer_context())
        return Response(out.data)


class ModifierReadinessView(APIView):
    """Every modifier option, with whether its stock-consumption effect is
    defined. `needs_data` rows are the worklist a chef must clear before a
    published modifier deducts correctly — nothing here is silent."""
    permission_classes = [capability_required(default='pos.manage')]

    def get(self, request):
        options = (ModifierOption.objects
                   .select_related('group', 'variant_recipe', 'unit')
                   .prefetch_related('deltas', 'group__dish_uses__dish__branch_ref')
                   .order_by('group__name_en', 'sort_order', 'name_en'))

        rows = []
        counts = {'ready': 0, 'needs_data': 0, 'no_impact': 0}
        for opt in options:
            status = opt.deduction_status
            counts[status] = counts.get(status, 0) + 1
            used_by = [
                {
                    'dish_id': str(dmg.dish_id),
                    'dish': dmg.dish.name_en,
                    'branch': (dmg.dish.branch_ref.name_en if dmg.dish.branch_ref_id else None),
                    'pos_item_name': dmg.dish.pos_item_name or dmg.dish.name_en,
                    'role': dmg.default_role,
                }
                for dmg in opt.group.dish_uses.all()
            ]
            rows.append({
                'option_id': str(opt.id),
                'group_id': str(opt.group_id),
                'group': opt.group.name_en,
                'name_en': opt.name_en,
                'name_ar': opt.name_ar,
                'kind': opt.kind,
                'price_delta': str(opt.price_delta),
                'status': status,
                'missing': opt.missing,
                'has_match_key': bool(opt.pos_mods_string),
                'pos_mods_string': opt.pos_mods_string,
                'delta_count': len(opt._delta_list),
                'variant_recipe': str(opt.variant_recipe_id) if opt.variant_recipe_id else None,
                'variant_recipe_name': opt.variant_recipe.name_en if opt.variant_recipe_id else None,
                'variant_recipe_published': bool(
                    opt.variant_recipe and opt.variant_recipe.inventory_recipe_id),
                'used_by': used_by,
                'unused': not used_by,
            })

        # groups whose pick rule can't be right for the options in them
        groups = []
        for g in ModifierGroup.objects.prefetch_related('options', 'dish_uses').order_by('name_en'):
            issues = group_rule_issues(g)
            if issues:
                groups.append({
                    'group_id': str(g.id), 'group': g.name_en, 'group_ar': g.name_ar,
                    'min_select': g.min_select, 'max_select': g.max_select,
                    'dish_count': len(g.dish_uses.all()), 'issues': issues,
                })

        return Response({
            'summary': {
                **counts,
                'total': len(rows),
                'rule_issues': len(groups),
                'needs_match_key': sum(
                    1 for r in rows
                    if r['status'] != 'no_impact' and not r['has_match_key'] and r['used_by']),
            },
            'options': rows,
            'rule_issues': groups,
        })
