from django.contrib import admin
from .models import (
    ProductionRecipe, ProductionRecipeIngredient, ProductionRecipeStep,
    DishRecipe, DishRecipeIngredient, DishRecipeStep, DishStandard,
)


class ProductionIngredientInline(admin.TabularInline):
    model = ProductionRecipeIngredient
    extra = 1


class ProductionStepInline(admin.TabularInline):
    model = ProductionRecipeStep
    extra = 1


class DishIngredientInline(admin.TabularInline):
    model = DishRecipeIngredient
    extra = 1


class DishStepInline(admin.TabularInline):
    model = DishRecipeStep
    extra = 1


class DishStandardInline(admin.StackedInline):
    model = DishStandard
    extra = 0


@admin.register(ProductionRecipe)
class ProductionRecipeAdmin(admin.ModelAdmin):
    list_display  = ['name_en', 'output_item_sku', 'output_qty', 'version', 'is_current']
    list_filter   = ['is_current']
    search_fields = ['name_en', 'name_ar', 'output_item_sku']
    inlines       = [ProductionIngredientInline, ProductionStepInline]


@admin.register(DishRecipe)
class DishRecipeAdmin(admin.ModelAdmin):
    list_display  = ['name_en', 'branch', 'pos_item_name', 'selling_price', 'cost', 'version', 'is_current']
    list_filter   = ['branch', 'category', 'is_current']
    search_fields = ['name_en', 'name_ar', 'pos_item_name']
    inlines       = [DishIngredientInline, DishStepInline, DishStandardInline]
