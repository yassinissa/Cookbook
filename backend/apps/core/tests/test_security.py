"""Security hardening — image content verification + the login throttle wiring."""
import base64

from django.test import TestCase
from rest_framework import serializers
from rest_framework.throttling import ScopedRateThrottle

from apps.core.views import ThrottledLoginView
from apps.cookbook.serializers.dish_recipe import verify_image_bytes

# A real 4x4 PNG.
_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGNc'
    'kSHDAANMcBZeDgA8KAE0wVqL+wAAAABJRU5ErkJggg=='
)


class VerifyImageBytesTests(TestCase):
    def test_accepts_a_real_png(self):
        verify_image_bytes(_PNG, field='image_data')  # no raise

    def test_rejects_a_script_relabelled_as_an_image(self):
        with self.assertRaises(serializers.ValidationError):
            verify_image_bytes(b"<script>alert(1)</script>", field='image_data')

    def test_rejects_an_svg(self):
        with self.assertRaises(serializers.ValidationError):
            verify_image_bytes(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', field='image_data')

    def test_rejects_empty_bytes(self):
        with self.assertRaises(serializers.ValidationError):
            verify_image_bytes(b'', field='image_data')


class LoginThrottleWiringTests(TestCase):
    def test_login_view_is_scope_throttled(self):
        # A regression guard: the password endpoint must keep a rate limit.
        self.assertIn(ScopedRateThrottle, ThrottledLoginView.throttle_classes)
        self.assertEqual(ThrottledLoginView.throttle_scope, 'login')

    def test_login_rate_is_configured_in_base_settings(self):
        from config.settings import base
        self.assertIn('login', base.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'])
        self.assertIn(
            'rest_framework.throttling.AnonRateThrottle',
            base.REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'],
        )
