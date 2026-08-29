"""
Base settings — shared across all environments.
Do NOT put secrets or environment-specific values here.
"""
from pathlib import Path
from datetime import timedelta
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY')

# ─── APPLICATIONS ────────────────────────────────────────────────────────────
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
]

LOCAL_APPS = [
    'apps.core',
    'apps.integrations',
    'apps.cookbook',
    'apps.accounts',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# ─── AUTHENTICATION ───────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=config('ACCESS_TOKEN_LIFETIME', default=60, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(minutes=config('REFRESH_TOKEN_LIFETIME', default=10080, cast=int)),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ─── INTERNATIONALISATION ─────────────────────────────────────────────────────
LANGUAGE_CODE = 'en'
TIME_ZONE = 'Asia/Kuwait'
USE_I18N = True
USE_L10N = True
USE_TZ = True

# ─── STATIC & MEDIA ──────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Dish photos are posted inline as a base64 data: URI on the recipe JSON, so the
# request body runs a few MB past Django's 2.5 MB default. Cap the decoded image
# at 5 MB (serializer) → ~7 MB of base64 text; 12 MB leaves headroom.
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024

# ─── DEFAULT PRIMARY KEY ──────────────────────────────────────────────────────
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── INVENTORY-PLATFORM INTEGRATION ──────────────────────────────────────────
# Cookbook is the authoring tool for ProductionRecipe / DishRecipe content.
# It reads item/store/prep-kitchen/unit reference data from the inventory
# platform's API, and pushes finished recipes back to it (replacing manual
# admin entry there) via apps.integrations.inventory_client.
INVENTORY_API_BASE_URL = config('INVENTORY_API_BASE_URL', default='http://localhost:8000/api')
# Service-account credentials Cookbook logs in with (JWT, via /api/auth/login/).
# That account needs a role inventory-platform accepts for recipe writes —
# see apps.integrations.inventory_client for the exact endpoints it calls.
INVENTORY_API_EMAIL = config('INVENTORY_API_EMAIL', default='')
INVENTORY_API_PASSWORD = config('INVENTORY_API_PASSWORD', default='')

# ─── COSTING ─────────────────────────────────────────────────────────────────
# Labour cost per serving = section avg monthly salary / working minutes per
# month * prep minutes. 208 h/month is what the source cook book uses (verified
# against its computed labour figures to 12 dp).
COOKBOOK_WORKING_HOURS_PER_MONTH = config('COOKBOOK_WORKING_HOURS_PER_MONTH', default=208, cast=int)
