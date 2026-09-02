"""
Reporting endpoints — the weekly cost-digest subscription + its public
one-click unsubscribe.
"""
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import access_for

from .models import DigestCadence, DigestSubscription


def _payload(user, sub):
    return {
        'enrolled': access_for(user).can('costing.view'),
        'cadence': sub.cadence if sub else DigestCadence.WEEKLY,
        'last_sent_at': sub.last_sent_at.isoformat() if sub and sub.last_sent_at else None,
    }


class DigestSubscriptionView(APIView):
    """GET / PATCH the calling user's weekly cost-digest preference."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sub = DigestSubscription.objects.filter(user=request.user).first()
        return Response(_payload(request.user, sub))

    def patch(self, request):
        cadence = request.data.get('cadence')
        if cadence not in DigestCadence.values:
            raise ValidationError({'cadence': f'Must be one of {DigestCadence.values}.'})
        sub, _ = DigestSubscription.objects.update_or_create(
            user=request.user, defaults={'cadence': cadence},
        )
        return Response(_payload(request.user, sub))


_UNSUB_HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cookbook</title></head>
<body style="margin:0;background:#f4efe6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#2b2420;">
<div style="max-width:460px;margin:14vh auto 0;padding:28px;background:#fffdf8;border:1px solid #e3d9c8;border-radius:12px;text-align:center;">
<div style="height:4px;background:#a8481c;border-radius:2px;margin:-28px -28px 22px;"></div>
<h1 style="font-size:19px;margin:0 0 8px;">{heading}</h1>
<p style="font-size:14px;color:#6f6357;margin:0;">{body}</p>
</div></body></html>"""


class DigestUnsubscribeView(APIView):
    """Public one-click opt-out, linked from the digest email footer."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        sub = get_object_or_404(DigestSubscription, unsubscribe_token=token)
        if sub.cadence != DigestCadence.OFF:
            sub.cadence = DigestCadence.OFF
            sub.save(update_fields=['cadence', 'updated_at'])
        return HttpResponse(_UNSUB_HTML.format(
            heading='You’re unsubscribed',
            body='You won’t get the weekly Cookbook cost report any more. '
                 'Turn it back on any time from Settings in the app.',
        ))
