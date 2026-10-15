"""
Sign-ins → the system action log.

Listens to Django's own auth signals rather than being called from the login
view, so `apps.core` (the JWT login) never imports the cookbook app:
  - `user_logged_in`: sent by core's ThrottledLoginView on a JWT login, and by
    Django itself on a /admin/ login.
  - `user_login_failed`: sent by `authenticate()` on a wrong username /
    password (credentials arrive with the password already scrubbed), and by
    the login view when the rate limit blocks an attempt.
  - `user_logged_out`: sent by core's logout view (the app's Sign out calls it
    before dropping its tokens) and by Django on an /admin/ logout.
The password is never read or stored — only the username that was tried.
"""
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver

from .audit import record
from .models import ActivityActionType, ActivityArea


def _client(request):
    if request is None:
        return ''
    meta = getattr(request, 'META', {})
    ip = (meta.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
          or meta.get('REMOTE_ADDR', ''))
    agent = meta.get('HTTP_USER_AGENT', '')[:120]
    channel = 'Django admin' if getattr(request, 'path', '').startswith('/admin') else 'app'
    return ' · '.join(b for b in (f'via {channel}', ip and f'from {ip}', agent) if b)


@receiver(user_logged_in, dispatch_uid='cookbook.audit.signed_in')
def log_sign_in(sender, request=None, user=None, **kwargs):
    if user is None:
        return
    profile = getattr(user, 'profile', None)
    record(user.username, area=ActivityArea.AUTH, action=ActivityActionType.SIGNED_IN,
           subject_type='user', subject_id=user.pk, code=user.username, path='/admin/users',
           label=(getattr(profile, 'display_name', '') or user.username), description=_client(request))


@receiver(user_login_failed, dispatch_uid='cookbook.audit.sign_in_failed')
def log_sign_in_failed(sender, credentials=None, request=None, reason='', **kwargs):
    tried = str((credentials or {}).get('username') or '')[:150]
    why = ('Blocked: too many attempts' if reason == 'rate_limited'
           else 'Wrong username or password, or the account is inactive')
    record('', area=ActivityArea.AUTH, action=ActivityActionType.SIGN_IN_FAILED,
           subject_type='user', label=tried or '(no username)', code=tried,
           description=' · '.join(b for b in (why, _client(request)) if b))


@receiver(user_logged_out, dispatch_uid='cookbook.audit.signed_out')
def log_sign_out(sender, request=None, user=None, **kwargs):
    if user is None or not getattr(user, 'is_authenticated', False):
        return
    profile = getattr(user, 'profile', None)
    record(user.username, area=ActivityArea.AUTH, action=ActivityActionType.SIGNED_OUT,
           subject_type='user', subject_id=user.pk, code=user.username, path='/admin/users',
           label=(getattr(profile, 'display_name', '') or user.username), description=_client(request))
