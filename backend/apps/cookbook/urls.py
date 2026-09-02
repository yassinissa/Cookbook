from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import views_menu
from . import views_plating
from . import views_reporting
from . import views_specials
from . import views_standards
from .views_activity import ActivityFeedView
from .views_dashboard import DashboardView

router = DefaultRouter()
router.register(r'reference/categories', views.MenuCategoryViewSet, basename='menu-category')
router.register(r'reference/branches', views.BranchViewSet, basename='branch')
router.register(r'reference/prep-kitchens', views.PrepKitchenViewSet, basename='prep-kitchen')
router.register(r'reference/sections', views.SectionViewSet, basename='section')
router.register(r'reference/approvers', views.ApproverViewSet, basename='approver')
router.register(r'reference/allergens', views.AllergenViewSet, basename='allergen')
router.register(r'reference/service-styles', views.ServiceStyleViewSet, basename='service-style')
router.register(r'reference/units', views.UnitScaleViewSet, basename='unit-scale')
router.register(r'reference/measurement-conversions', views.StandardMeasurementConversionViewSet, basename='measurement-conversion')
router.register(r'reference/taste-descriptors', views.TasteDescriptorViewSet, basename='taste-descriptor')
router.register(r'dish-recipes', views.DishRecipeViewSet, basename='dish-recipe')
router.register(r'production-recipes', views.ProductionRecipeViewSet, basename='production-recipe')
router.register(r'dish-standards', views_standards.DishStandardViewSet, basename='dish-standard')
router.register(r'plating-guides', views_plating.PlatingGuideViewSet, basename='plating-guide')
router.register(r'item-conversions', views.ItemConversionViewSet, basename='item-conversion')
router.register(r'item-nutrition', views.ItemNutritionViewSet, basename='item-nutrition')
router.register(r'item-storage', views.ItemStorageViewSet, basename='item-storage')
router.register(r'menus', views_menu.MenuViewSet, basename='menu')
router.register(r'menu-lines', views_menu.MenuLineViewSet, basename='menu-line')
router.register(r'menu-periods', views_specials.MenuPeriodViewSet, basename='menu-period')

urlpatterns = [
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('activity/', ActivityFeedView.as_view(), name='activity'),
    path('digest-subscription/', views_reporting.DigestSubscriptionView.as_view(), name='digest-subscription'),
    path('public/digest/unsubscribe/<uuid:token>/', views_reporting.DigestUnsubscribeView.as_view(),
         name='digest-unsubscribe'),
    path('', include(router.urls)),
]
