from django.apps import AppConfig


class CookbookConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.cookbook'

    def ready(self):
        from . import signals  # noqa: F401 — sign-ins → the action log
