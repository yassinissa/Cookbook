from .base import *  # noqa: F401,F403
from decouple import config

DEBUG = True

# No rate limiting locally or in the test suite (which runs on these settings)
# — it only matters in front of the internet, and it makes fast test loops
# flaky with 429s. Rates set to None also disables the scoped login throttle.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_THROTTLE_CLASSES': (),
    'DEFAULT_THROTTLE_RATES': {k: None for k in REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']},
}

ALLOWED_HOSTS = ['*']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

CORS_ALLOW_ALL_ORIGINS = True

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
