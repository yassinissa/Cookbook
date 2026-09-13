"""
InventoryClient must never let a raw `requests` exception escape — every
caller across the codebase (services.py, publishing.py, views.py) only
catches InventoryAPIError, since that's the entire point of wrapping the
network layer in this class. Before this fix, a connection failure that
survived the built-in one-retry (a fully-down or never-woke Render
instance, not just a slow cold start) leaked a raw ConnectionError/Timeout
straight out of _login()/_request(), 500ing the whole request — including
saves that had nothing to do with inventory data, like a plain photo
upload (see apps.cookbook.services.get_inventory_items_by_sku, which
already expected to catch exactly InventoryAPIError and degrade to {}).
"""
from unittest import mock

import requests
from django.test import SimpleTestCase, override_settings

from apps.integrations.inventory_client import InventoryAPIError, InventoryClient


@override_settings(
    INVENTORY_API_BASE_URL='http://127.0.0.1:1/api',
    INVENTORY_API_EMAIL='svc@example.com',
    INVENTORY_API_PASSWORD='x',
)
class InventoryClientConnectionFailureTests(SimpleTestCase):
    def setUp(self):
        # every retry sleep would otherwise really wait 2s per test
        self._sleep_patch = mock.patch('apps.integrations.inventory_client.time.sleep')
        self._sleep_patch.start()
        self.addCleanup(self._sleep_patch.stop)

    @mock.patch('apps.integrations.inventory_client.requests.post')
    def test_login_wraps_connection_error_after_both_attempts_fail(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError('refused')
        client = InventoryClient()
        with self.assertRaises(InventoryAPIError):
            client._login()
        self.assertEqual(mock_post.call_count, 2)   # first attempt + the one retry

    @mock.patch('apps.integrations.inventory_client.requests.post')
    def test_login_wraps_timeout_after_both_attempts_fail(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout('timed out')
        client = InventoryClient()
        with self.assertRaises(InventoryAPIError):
            client._login()

    @mock.patch('apps.integrations.inventory_client.requests.request')
    @mock.patch('apps.integrations.inventory_client.requests.post')
    def test_request_wraps_connection_error_after_both_attempts_fail(self, mock_post, mock_request):
        mock_post.return_value = mock.Mock(ok=True, json=lambda: {'access': 'tok'})
        mock_request.side_effect = requests.exceptions.ConnectionError('refused')
        client = InventoryClient()
        with self.assertRaises(InventoryAPIError):
            client._request('GET', '/items/')
        self.assertEqual(mock_request.call_count, 2)   # first attempt + the one retry

    @mock.patch('apps.integrations.inventory_client.requests.request')
    @mock.patch('apps.integrations.inventory_client.requests.post')
    def test_request_wraps_connection_error_on_401_relogin_retry(self, mock_post, mock_request):
        mock_post.return_value = mock.Mock(ok=True, json=lambda: {'access': 'tok'})
        # first call succeeds but is a 401 (expired token) -> triggers a
        # re-login, then the retried request itself fails to connect.
        mock_request.side_effect = [
            mock.Mock(ok=False, status_code=401),
            requests.exceptions.ConnectionError('refused'),
        ]
        client = InventoryClient()
        with self.assertRaises(InventoryAPIError):
            client._request('GET', '/items/')
