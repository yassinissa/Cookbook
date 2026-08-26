from decimal import Decimal

from rest_framework import serializers

from apps.cookbook.models import (
    Branch, DishRecipe, Menu, MenuLine, MenuSnapshot, MenuSnapshotLine,
)
from .reference import BranchSerializer


def _food_cost_pct(cost, price):
    if not price or Decimal(price) <= 0:
        return None
    return (Decimal(cost) / Decimal(price) * 100).quantize(Decimal('0.01'))


class MenuLineSerializer(serializers.ModelSerializer):
    dish_name      = serializers.CharField(source='dish.name_en', read_only=True)
    dish_name_ar   = serializers.CharField(source='dish.name_ar', read_only=True)
    recipe_code    = serializers.CharField(source='dish.recipe_code', read_only=True)
    category       = serializers.CharField(source='dish.category.name', read_only=True, default=None)
    category_ar    = serializers.CharField(source='dish.category.menu_title_ar', read_only=True, default='')
    category_order = serializers.IntegerField(source='dish.category.sort_order', read_only=True, default=0)
    recipe_cost    = serializers.DecimalField(source='dish.cost', max_digits=12, decimal_places=3, read_only=True)
    recipe_price   = serializers.DecimalField(source='dish.selling_price', max_digits=12, decimal_places=3, read_only=True)
    rating_status  = serializers.CharField(source='dish.rating_status', read_only=True)
    rating         = serializers.DecimalField(source='dish.rating', max_digits=4, decimal_places=1, read_only=True)
    effective_price = serializers.SerializerMethodField()
    food_cost_pct   = serializers.SerializerMethodField()

    class Meta:
        model  = MenuLine
        fields = [
            'id', 'dish', 'dish_name', 'dish_name_ar', 'recipe_code',
            'category', 'category_ar', 'category_order',
            'recipe_cost', 'recipe_price', 'rating', 'rating_status',
            'menu_price', 'effective_price', 'food_cost_pct',
            'pos_name', 'image_url', 'sort_order', 'is_available',
        ]

    def get_effective_price(self, obj):
        return obj.effective_price

    def get_food_cost_pct(self, obj):
        return _food_cost_pct(obj.dish.cost, obj.effective_price)


class MenuListSerializer(serializers.ModelSerializer):
    branch_detail = BranchSerializer(source='branch', read_only=True)
    line_count    = serializers.IntegerField(source='lines.count', read_only=True)

    class Meta:
        model  = Menu
        fields = ['id', 'branch', 'branch_detail', 'name', 'name_ar',
                  'line_count', 'last_snapshot_at', 'is_active', 'created_at']


class MenuDetailSerializer(MenuListSerializer):
    lines = MenuLineSerializer(many=True, read_only=True)

    class Meta(MenuListSerializer.Meta):
        fields = MenuListSerializer.Meta.fields + ['notes', 'lines']


class MenuWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Menu
        fields = ['branch', 'name', 'name_ar', 'notes', 'is_active']


class MenuSnapshotLineSerializer(serializers.ModelSerializer):
    class Meta:
        model  = MenuSnapshotLine
        fields = ['id', 'dish_name', 'recipe_code', 'category', 'cost', 'menu_price', 'food_cost_pct']


class MenuSnapshotSerializer(serializers.ModelSerializer):
    lines = MenuSnapshotLineSerializer(many=True, read_only=True)

    class Meta:
        model  = MenuSnapshot
        fields = ['id', 'label', 'taken_by', 'created_at', 'lines']
