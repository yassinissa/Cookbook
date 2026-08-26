from django.contrib import admin
from .models import (
    MenuCategory, Branch, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor,
    ProductionRecipe, ProductionRecipeIngredient, ProductionRecipeStep,
    DishRecipe, DishRecipeIngredient, DishRecipeStep, DishStandard,
    ItemConversion, ItemConversionLine, ItemNutrition,
)


# ── Reference data ────────────────────────────────────────────────────────

@admin.register(MenuCategory)
class MenuCategoryAdmin(admin.ModelAdmin):
    list_display  = ['name', 'name_ar', 'sort_order']
    search_fields = ['name']


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display  = ['name_en', 'name_ar', 'code', 'sort_order']
    search_fields = ['name_en']


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
    list_display  = ['name_en', 'recipe_code', 'output_item_sku', 'output_qty', 'section', 'cost', 'version', 'is_current']
    list_filter   = ['is_current', 'section']
    search_fields = ['name_en', 'name_ar', 'recipe_code', 'output_item_sku']
    inlines       = [ProductionIngredientInline, ProductionStepInline]


@admin.register(DishRecipe)
class DishRecipeAdmin(admin.ModelAdmin):
    list_display  = ['name_en', 'recipe_code', 'branch', 'category', 'selling_price', 'cost', 'rating_status', 'version', 'is_current']
    list_filter   = ['branch', 'category', 'is_current', 'rating_status']
    search_fields = ['name_en', 'name_ar', 'recipe_code', 'pos_item_name']
    inlines       = [DishIngredientInline, DishStepInline, DishStandardInline]


# ── Item supplements ────────────────────────────────────────────────────────

class ItemConversionLineInline(admin.TabularInline):
    model = ItemConversionLine
    extra = 1


@admin.register(ItemConversion)
class ItemConversionAdmin(admin.ModelAdmin):
    list_display  = ['item_sku', 'base_unit', 'cost_per_base_unit', 'cost_source',
                     'grams_per_piece', 'pieces_per_kg']
    list_filter   = ['cost_source', 'base_unit']
    search_fields = ['item_sku']
    inlines       = [ItemConversionLineInline]


@admin.register(ItemNutrition)
class ItemNutritionAdmin(admin.ModelAdmin):
    list_display  = ['item_sku', 'unit_scale', 'calories', 'protein_g', 'fat_g', 'verification_notes']
    search_fields = ['item_sku']
