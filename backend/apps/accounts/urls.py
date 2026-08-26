from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('capabilities', views.CapabilityViewSet, basename='capability')
router.register('roles', views.RoleViewSet, basename='role')
router.register('users', views.UserViewSet, basename='account-user')

urlpatterns = router.urls
