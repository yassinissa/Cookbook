"""
NOTE — Master URL file. All API routes are prefixed with /api/.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('api/health/', health_check, name='health-check'),
    path('admin/', admin.site.urls),
    path('api/inventory/', include('apps.integrations.urls')),
    path('api/auth/', include('apps.core.urls')),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/cookbook/', include('apps.cookbook.urls')),
]
