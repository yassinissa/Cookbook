"""GET /api/health/ — Render's healthCheckPath. Liveness + a DB round-trip."""
from unittest import mock

from django.test import TestCase


class HealthCheckTests(TestCase):
    def test_ok_when_db_reachable(self):
        resp = self.client.get('/api/health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'status': 'ok'})

    def test_no_auth_required(self):
        # No credentials set — must still answer (Render polls it unauthenticated).
        resp = self.client.get('/api/health/')
        self.assertEqual(resp.status_code, 200)

    def test_503_when_db_unreachable(self):
        with mock.patch('config.urls.connection') as conn:
            conn.cursor.side_effect = Exception('connection refused')
            resp = self.client.get('/api/health/')
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.json(), {'status': 'error', 'database': 'unreachable'})
