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
# Dish / plating photos (MEDIA) are NOT served here — WhiteNoise only serves
# STATIC_ROOT. In production they need object storage (S3/R2) or a Render Disk
# mounted at backend/media plus a media route. Tracked as a follow-up; the
# recipe/menu APIs work without it, only the images 404.

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

SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
