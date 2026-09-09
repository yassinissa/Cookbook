from .base import *  # noqa: F401,F403
from decouple import config, Csv

DEBUG = False

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='', cast=Csv())

# ─── STATIC FILES ────────────────────────────────────────────────────────────
# WhiteNoise serves the API's own static assets (Django admin, DRF browsable
# API) straight from the app — no separate static host needed. It must sit
# directly after SecurityMiddleware. `whitenoise` is already in
# requirements/production.txt.
MIDDLEWARE = [
    MIDDLEWARE[0],                                       # corsheaders
    MIDDLEWARE[1],                                       # security
    'whitenoise.middleware.WhiteNoiseMiddleware',
    *MIDDLEWARE[2:],
]
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
# Dish / plating photos (MEDIA) live on the Render Disk mounted at
# backend/media (see render.yaml) and are served by the explicit `^media/`
# route in config/urls.py — WhiteNoise itself only serves STATIC_ROOT and
# can't pick up newly-uploaded files without a per-request stat. Object
# storage (S3/R2) is the eventual move if photo volume grows.

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME'),
        'USER': config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='', cast=Csv())

# Behind a TLS-terminating proxy (Render's edge, or Caddy/Traefik when self-
# hosted) Django 4.x rejects admin / DRF-browsable-API POSTs unless the origin
# is trusted explicitly — the scheme must be included, e.g.
# "https://cookbook.example.com". Falls back to CORS_ALLOWED_ORIGINS so Render,
# where only that was set, keeps working unchanged.
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS', default=','.join(CORS_ALLOWED_ORIGINS), cast=Csv()
)

# ─── SECURITY HEADERS ────────────────────────────────────────────────────────
# Render terminates TLS at its edge and forwards to gunicorn over plain HTTP —
# without this Django thinks every request is insecure (secure-cookie + HSTS
# logic misfires, and SECURE_SSL_REDIRECT can loop).
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HSTS — the API is HTTPS-only. Start at 1h; raise to a year + preload once
# confirmed stable (SECURE_HSTS_SECONDS is sticky in browsers).
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=3600, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config('SECURE_HSTS_INCLUDE_SUBDOMAINS', default=False, cast=bool)
SECURE_HSTS_PRELOAD = config('SECURE_HSTS_PRELOAD', default=False, cast=bool)

SECURE_CONTENT_TYPE_NOSNIFF = True          # don't let browsers MIME-sniff uploads
SECURE_REFERRER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
