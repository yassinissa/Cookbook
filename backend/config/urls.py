"""
NOTE — Master URL file. All API routes are prefixed with /api/.
"""
from django.conf import settings
from django.conf.urls.static import static
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

# Uploaded dish photos. In production these are better served by the web server
# / object storage, but for dev (and the small Render disk) Django serves them.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
