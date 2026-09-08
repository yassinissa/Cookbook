"""The `^media/` route must serve uploaded photos in every environment.

Django forces DEBUG=False during tests, so `django.conf.urls.static.static()`
(DEBUG-only) would 404 here — which is exactly the prod bug this route fixes.
"""
import os

from django.conf import settings
from django.test import TestCase


class MediaServingTests(TestCase):
    probe_name = 'core_media_serving_probe.txt'

    def setUp(self):
        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
        self.probe_path = os.path.join(settings.MEDIA_ROOT, self.probe_name)
        with open(self.probe_path, 'wb') as fh:
            fh.write(b'probe-ok')

    def tearDown(self):
        if os.path.exists(self.probe_path):
            os.remove(self.probe_path)

    def test_existing_media_file_is_served(self):
        resp = self.client.get(f'/media/{self.probe_name}')
        self.assertEqual(resp.status_code, 200)
        body = b''.join(resp.streaming_content) if resp.streaming else resp.content
        self.assertEqual(body, b'probe-ok')

    def test_missing_media_file_404s(self):
        resp = self.client.get('/media/does-not-exist.jpg')
        self.assertEqual(resp.status_code, 404)

    def test_no_path_traversal(self):
        resp = self.client.get('/media/../config/settings/base.py')
        self.assertIn(resp.status_code, (400, 404))
