"""
NOTE — Reporting

DigestSubscription: a user's preference for the weekly cost-report email.
Enrolment is opt-out — anyone with `costing.view` is emailed unless they hold
a row here with `cadence='off'`. The email body is built by
apps.cookbook.reporting and sent by `manage.py send_cost_digest` (run weekly
by a Render cron). `unsubscribe_token` backs a public one-click opt-out link.
"""
import uuid

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class DigestCadence(models.TextChoices):
    WEEKLY = 'weekly', 'Weekly'
    OFF    = 'off',    'Off'


class DigestSubscription(BaseModel):
    user              = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                          related_name='digest_subscription')
    cadence           = models.CharField(max_length=10, choices=DigestCadence.choices,
                          default=DigestCadence.WEEKLY)
    last_sent_at      = models.DateTimeField(null=True, blank=True)
    unsubscribe_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)

    def __str__(self):
        return f'{self.user.username}: cost digest {self.cadence}'
