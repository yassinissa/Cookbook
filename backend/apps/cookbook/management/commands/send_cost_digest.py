"""
Send the weekly cost-report digest.

    python manage.py send_cost_digest              # send to everyone due
    python manage.py send_cost_digest --dry-run    # build + print, send nothing
    python manage.py send_cost_digest --user lina  # just one recipient (ignores recency)

Enrolment is opt-out: every active user with an email address and the
`costing.view` capability is a recipient, unless they hold a
DigestSubscription row with cadence='off'. A recipient whose digest would be
empty is skipped (no "nothing to report" email). Run weekly by a Render cron.
"""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from django.core.management.base import BaseCommand
from django.template.loader import render_to_string
from django.utils import timezone

from apps.accounts.access import access_for
from apps.cookbook.models import DigestCadence, DigestSubscription
from apps.cookbook.reporting import build_weekly_digest

User = get_user_model()
_RESEND_GUARD = timedelta(days=5)   # don't re-send within this window unless forced


class Command(BaseCommand):
    help = 'Email the weekly cost-report digest to enrolled users.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Build and print each digest; send nothing, stamp nothing.')
        parser.add_argument('--user', help='Only this user (id or username); ignores the resend guard.')
        parser.add_argument('--force', action='store_true',
                            help='Ignore the resend guard for everyone.')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        one = opts['user']
        force = opts['force'] or bool(one)

        if one:
            recipients = User.objects.filter(username=one) | User.objects.filter(pk=one if one.isdigit() else 0)
        else:
            recipients = User.objects.filter(is_active=True).exclude(email='')

        subs = {s.user_id: s for s in DigestSubscription.objects.all()}
        now = timezone.now()
        sent = skipped = 0

        for user in recipients.order_by('username'):
            sub = subs.get(user.id)
            if sub and sub.cadence == DigestCadence.OFF:
                skipped += 1
                continue
            if not access_for(user).can('costing.view'):
                skipped += 1
                continue
            if not user.email:
                self.stdout.write(f'  skip {user.username}: no email address')
                skipped += 1
                continue
            if not force and sub and sub.last_sent_at and (now - sub.last_sent_at) < _RESEND_GUARD:
                skipped += 1
                continue

            digest = build_weekly_digest(user)
            if digest is None:
                self.stdout.write(f'  skip {user.username}: nothing to report')
                skipped += 1
                continue

            if sub is None:
                sub = DigestSubscription(user=user)   # created lazily so we have a token to link

            ctx = {
                'digest': digest,
                'generated_at': now.strftime('%A %d %B %Y'),
                'dashboard_url': settings.FRONTEND_URL,
                'unsubscribe_url': (
                    f'{settings.FRONTEND_URL}/api/cookbook/public/digest/unsubscribe/{sub.unsubscribe_token}/'
                ),
            }
            subject = f'Cookbook cost report — {digest["over_target_total"]} dishes over target'
            text = render_to_string('cookbook/email/cost_digest.txt', ctx)
            html = render_to_string('cookbook/email/cost_digest.html', ctx)

            if dry:
                self.stdout.write(self.style.MIGRATE_HEADING(f'\n--- {user.email} ---'))
                self.stdout.write(text)
                continue

            msg = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [user.email])
            msg.attach_alternative(html, 'text/html')
            msg.send()
            sub.last_sent_at = now
            sub.save()
            sent += 1
            self.stdout.write(f'  sent to {user.email}')

        verb = 'would send' if dry else 'sent'
        self.stdout.write(self.style.SUCCESS(f'\n{verb} {sent}, skipped {skipped}'))
