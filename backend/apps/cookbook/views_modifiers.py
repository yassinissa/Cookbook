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

from .models import DishRecipe, ModifierGroup, ModifierOption
from .serializers.modifiers import (
    ModifierGroupSerializer, ModifierGroupWriteSerializer,
    DishModifierListSerializer, DishModifierDetailSerializer, DishModifierWriteSerializer,
)


class ModifierGroupViewSet(viewsets.ModelViewSet):
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

    def update(self, request, *args, **kwargs):
        dish = self.get_object()
        writer = DishModifierWriteSerializer(data=request.data)
        writer.is_valid(raise_exception=True)
        writer.save(dish=dish)
        dish.refresh_from_db()
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
                    'branch': (dmg.dish.branch_ref.name_en if dmg.dish.branch_ref_id
                               else (dmg.dish.branch or None)),
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

        return Response({
            'summary': {
                **counts,
                'total': len(rows),
                'needs_match_key': sum(
                    1 for r in rows
                    if r['status'] != 'no_impact' and not r['has_match_key'] and r['used_by']),
            },
            'options': rows,
        })
