"""
Refresh-token revocation (simplejwt's `token_blacklist` app).

JWTs live in the browser, so the server can only end a session by refusing
its refresh token. Every refresh token issued is recorded (OutstandingToken);
these helpers move them to the blacklist:
  - `revoke_refresh_token`: one token — Sign out.
  - `revoke_all_refresh_tokens`: every token a user holds — on a password
    change or deactivation, wherever it happens (Users admin API, Django admin,
    `changepassword`), via the User save hooks below.
An access token already handed out still works until it expires
(ACCESS_TOKEN_LIFETIME); that is the trade-off of stateless access tokens.
"""
from django.conf import settings
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken


def revoke_refresh_token(raw, user):
    """Blacklist one refresh token, only if it belongs to `user`. A bad or
    already-dead token is ignored — signing out must always succeed."""
    try:
        token = RefreshToken(raw)
    except TokenError:
        return False
    if str(token.get(settings.SIMPLE_JWT.get('USER_ID_CLAIM', 'user_id'))) != str(user.pk):
        return False
    token.blacklist()
    return True


def revoke_all_refresh_tokens(user):
    live = OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=t) for t in live], ignore_conflicts=True)


@receiver(pre_save, sender=settings.AUTH_USER_MODEL, dispatch_uid='core.tokens.user_pre_save')
def _remember_credentials(sender, instance, update_fields=None, **kwargs):
    if not instance.pk or (update_fields is not None
                           and not {'password', 'is_active'} & set(update_fields)):
        instance._old_credentials = None    # e.g. the last_login touch on every sign-in
        return
    instance._old_credentials = (sender.objects.filter(pk=instance.pk)
                                 .values_list('password', 'is_active').first())


@receiver(post_save, sender=settings.AUTH_USER_MODEL, dispatch_uid='core.tokens.user_post_save')
def _revoke_on_credential_change(sender, instance, created, **kwargs):
    old = getattr(instance, '_old_credentials', None)
    if created or not old:
        return
    old_password, was_active = old
    if old_password != instance.password or (was_active and not instance.is_active):
        revoke_all_refresh_tokens(instance)
