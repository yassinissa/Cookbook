"""
NOTE — Master URL file. All API routes are prefixed with /api/.
"""
from django.conf import settings
from django.contrib import admin
from django.urls import path, include, re_path
from django.db import connection
from django.http import JsonResponse
from django.views.static import serve as serve_media


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

# Uploaded dish / plating photos, served straight off the Render disk mounted
# at MEDIA_ROOT. `django.conf.urls.static.static()` only wires this under
# DEBUG, which left every image 404 in production even though the disk was
# mounted and the files were on it — so serve it explicitly in every
# environment. `serve` uses `safe_join` (no path traversal). A dedicated
# object store / CDN would scale better, but at this volume (a handful of
# photos) the single gthread worker serving them directly is fine — the same
# tradeoff this service already accepts elsewhere (see the worker-count note
# in render.yaml / publishing.py).
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve_media, {'document_root': settings.MEDIA_ROOT}),
]
