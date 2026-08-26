"""Serializer mixin: blank out cost / price / margin figures for users who
lack the `costing.view` capability. A prep or line cook can read a recipe
without seeing money."""
from apps.accounts.access import access_for


class HidesCostingFields:
    # fields nulled when the requester can't see costing
    COSTING_FIELDS = (
        'cost', 'labor_cost', 'selling_price', 'food_cost_pct',
        'cost_breakdown', 'nutrition_cost', 'cost_per_unit',
        'recipe_cost', 'recipe_price', 'menu_price', 'effective_price',
    )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request is None or access_for(request).can('costing.view'):
            return data
        for field in self.COSTING_FIELDS:
            if field in data:
                data[field] = None if not isinstance(data.get(field), dict) else {}
        return data
