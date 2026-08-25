"""
NOTE — Inventory-platform API client

Cookbook is the authoring tool for recipe content; the inventory platform
stays the single source of truth for items, units, stores and prep kitchens.
This client is the only place that talks to it:

  - read_* methods pull reference data (items/units/stores/prep kitchens) so
    Cookbook's recipe editor can only reference SKUs that actually exist.
  - push_* methods create/update ProductionRecipe / DishRecipe records over
    there, replacing what used to be typed by hand into its admin.

Logs in once with a service-account JWT (INVENTORY_API_USERNAME/PASSWORD)
and re-authenticates automatically on a 401 — callers never see tokens.
"""
import requests
from django.conf import settings


class InventoryAPIError(Exception):
    pass


class InventoryClient:
    def __init__(self):
        self.base_url = settings.INVENTORY_API_BASE_URL.rstrip('/')
        self.username = settings.INVENTORY_API_USERNAME
        self.password = settings.INVENTORY_API_PASSWORD
        self._access_token = None

    # ── auth ──────────────────────────────────────────────────────────────
    def _login(self):
        resp = requests.post(
            f'{self.base_url}/auth/login/',
            json={'username': self.username, 'password': self.password},
            timeout=10,
        )
        if not resp.ok:
            raise InventoryAPIError(f'Inventory login failed: {resp.status_code} {resp.text}')
        self._access_token = resp.json()['access']

    def _request(self, method, path, **kwargs):
        if self._access_token is None:
            self._login()

        def do_request():
            headers = kwargs.pop('headers', {})
            headers['Authorization'] = f'Bearer {self._access_token}'
            return requests.request(method, f'{self.base_url}/{path.lstrip("/")}', headers=headers, timeout=15, **kwargs)

        resp = do_request()
        if resp.status_code == 401:
            self._login()
            resp = do_request()
        if not resp.ok:
            raise InventoryAPIError(f'{method} {path} failed: {resp.status_code} {resp.text}')
        return resp.json() if resp.content else None

    # ── read: reference data ─────────────────────────────────────────────
    def get_items(self, params=None):
        return self._request('GET', '/items/', params=params)

    def get_units(self):
        return self._request('GET', '/items/units/')

    def get_stores(self, params=None):
        return self._request('GET', '/stores/', params=params)

    def get_prep_kitchens(self, params=None):
        return self._request('GET', '/prep-kitchens/', params=params)

    # ── write: recipe content ────────────────────────────────────────────
    def create_production_recipe(self, payload):
        return self._request('POST', '/recipes/production/', json=payload)

    def update_production_recipe(self, recipe_id, payload):
        return self._request('PATCH', f'/recipes/production/{recipe_id}/', json=payload)

    def create_dish_recipe(self, payload):
        return self._request('POST', '/recipes/dish/', json=payload)

    def update_dish_recipe(self, recipe_id, payload):
        return self._request('PATCH', f'/recipes/dish/{recipe_id}/', json=payload)
