from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'reference/categories', views.MenuCategoryViewSet, basename='menu-category')
router.register(r'reference/sections', views.SectionViewSet, basename='section')
router.register(r'reference/approvers', views.ApproverViewSet, basename='approver')
router.register(r'reference/allergens', views.AllergenViewSet, basename='allergen')
router.register(r'reference/service-styles', views.ServiceStyleViewSet, basename='service-style')
router.register(r'reference/units', views.UnitScaleViewSet, basename='unit-scale')
router.register(r'reference/measurement-conversions', views.StandardMeasurementConversionViewSet, basename='measurement-conversion')
router.register(r'reference/taste-descriptors', views.TasteDescriptorViewSet, basename='taste-descriptor')
router.register(r'dish-recipes', views.DishRecipeViewSet, basename='dish-recipe')

urlpatterns = [
    path('', include(router.urls)),
]
