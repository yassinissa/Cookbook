"""
NOTE — Master URL file. All API routes are prefixed with /api/.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.db import connection
from django.http import JsonResponse


def health_check(request):
    """Liveness + a real DB round-trip. Render's `healthCheckPath` polls this;
    a 200 that only proves the process is up would keep routing traffic to an
    instance that can't reach Postgres. Returns 503 on a DB failure."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception:
        return JsonResponse({'status': 'error', 'database': 'unreachable'}, status=503)
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('api/health/', health_check, name='health-check'),
    path('admin/', admin.site.urls),
    path('api/inventory/', include('apps.integrations.urls')),
    path('api/auth/', include('apps.core.urls')),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/cookbook/', include('apps.cookbook.urls')),
]

# Uploaded dish photos, served straight off the Render disk mounted at
# MEDIA_ROOT. A dedicated object store / CDN would scale better, but at this
# volume (a handful of dish + plating photos) gunicorn serving them directly
# is fine — this single-worker service already accepts that tradeoff
# elsewhere (see publishing.py's worker count comment).
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
