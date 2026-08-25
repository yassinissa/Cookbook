from django.contrib import admin
from .models import (
    MenuCategory, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor,
    ProductionRecipe, ProductionRecipeIngredient, ProductionRecipeStep,
    DishRecipe, DishRecipeIngredient, DishRecipeStep, DishStandard,
)


# ── Reference data ────────────────────────────────────────────────────────

@admin.register(MenuCategory)
class MenuCategoryAdmin(admin.ModelAdmin):
    search_fields = ['name']


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display  = ['name', 'avg_monthly_salary']
    search_fields = ['name']


@admin.register(Approver)
class ApproverAdmin(admin.ModelAdmin):
    search_fields = ['name']


@admin.register(Allergen)
class AllergenAdmin(admin.ModelAdmin):
    search_fields = ['name']


@admin.register(ServiceStyle)
class ServiceStyleAdmin(admin.ModelAdmin):
    search_fields = ['name']


@admin.register(UnitScale)
class UnitScaleAdmin(admin.ModelAdmin):
    list_display  = ['code', 'description']
    search_fields = ['code', 'description']


@admin.register(StandardMeasurementConversion)
class StandardMeasurementConversionAdmin(admin.ModelAdmin):
    list_display = ['label', 'equiv_1', 'equiv_2', 'equiv_3', 'equiv_4', 'equiv_5']


@admin.register(TasteDescriptor)
class TasteDescriptorAdmin(admin.ModelAdmin):
    list_display  = ['category', 'value']
    list_filter   = ['category']
    search_fields = ['value']


# ── Recipes ───────────────────────────────────────────────────────────────

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
    list_display  = ['name_en', 'output_item_sku', 'output_qty', 'section', 'version', 'is_current']
    list_filter   = ['is_current', 'section']
    search_fields = ['name_en', 'name_ar', 'output_item_sku']
    inlines       = [ProductionIngredientInline, ProductionStepInline]


@admin.register(DishRecipe)
class DishRecipeAdmin(admin.ModelAdmin):
    list_display  = ['name_en', 'branch', 'category', 'pos_item_name', 'selling_price', 'cost', 'version', 'is_current']
    list_filter   = ['branch', 'category', 'is_current']
    search_fields = ['name_en', 'name_ar', 'pos_item_name']
    inlines       = [DishIngredientInline, DishStepInline, DishStandardInline]
