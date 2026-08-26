"""
NOTE — Inventory-platform API client

Cookbook is the authoring tool for recipe content; the inventory platform
stays the single source of truth for items, units, stores and prep kitchens.
This client is the only place that talks to it:

  - read_* methods pull reference data (items/units/conversions/stores/prep
    kitchens) so Cookbook's recipe editor can only reference SKUs that
    actually exist, and so costing can convert between units.
  - push_* methods create/update ProductionRecipe / DishRecipe records over
    there — defined but not wired yet (see the master plan, Stage 8).

Logs in once with a service-account JWT (INVENTORY_API_EMAIL/PASSWORD)
and re-authenticates automatically on a 401 — callers never see tokens.

The platform is deployed on Render; a cold instance can take 30–60s to wake.
Timeouts are generous and every request retries once on a connection/timeout
error so a cold start degrades to "slow", never to a silent failure that the
costing layer would read as "every ingredient is unknown, cost = 0".
"""
import time

import requests
from django.conf import settings

LOGIN_TIMEOUT = 30
REQUEST_TIMEOUT = 30
RETRY_ON = (requests.exceptions.Timeout, requests.exceptions.ConnectionError)


class InventoryAPIError(Exception):
    pass


class InventoryClient:
    def __init__(self):
        self.base_url = settings.INVENTORY_API_BASE_URL.rstrip('/')
        self.email = settings.INVENTORY_API_EMAIL
        self.password = settings.INVENTORY_API_PASSWORD
        self._access_token = None

    # ── auth ──────────────────────────────────────────────────────────────
    def _login(self):
        try:
            resp = requests.post(
                f'{self.base_url}/auth/login/',
                json={'email': self.email, 'password': self.password},
                timeout=LOGIN_TIMEOUT,
            )
        except RETRY_ON:
            time.sleep(2)
            resp = requests.post(
                f'{self.base_url}/auth/login/',
                json={'email': self.email, 'password': self.password},
                timeout=LOGIN_TIMEOUT,
            )
        if not resp.ok:
            raise InventoryAPIError(f'Inventory login failed: {resp.status_code} {resp.text}')
        self._access_token = resp.json()['access']

    def _request(self, method, path, **kwargs):
        if self._access_token is None:
            self._login()

        url = f'{self.base_url}/{path.lstrip("/")}'

        def do_request():
            headers = {**kwargs.pop('headers', {}), 'Authorization': f'Bearer {self._access_token}'}
            return requests.request(method, url, headers=headers, timeout=REQUEST_TIMEOUT, **kwargs)

        try:
            resp = do_request()
        except RETRY_ON:
            time.sleep(2)
            resp = do_request()

        if resp.status_code == 401:
            self._login()
            resp = do_request()
        if not resp.ok:
            raise InventoryAPIError(f'{method} {path} failed: {resp.status_code} {resp.text}')
        return resp.json() if resp.content else None

    # ── read: reference data ─────────────────────────────────────────────
    def _get_all_pages(self, path, params=None):
        """inventory-platform paginates every list endpoint (25/page, up to
        500/page via ?page_size=). Cookbook always wants the full set for a
        reference-data pull, so walk every page and flatten into one list.
        Some endpoints (units, conversions) return a bare list instead — pass
        those straight through."""
        params = dict(params or {})
        params.setdefault('page_size', 500)
        results = []
        page = 1
        while True:
            params['page'] = page
            data = self._request('GET', path, params=params)
            if isinstance(data, list):
                return data
            results.extend(data['results'])
            if not data.get('next'):
                break
            page += 1
        return results

    def get_items(self, params=None):
        """List view — lightweight fields only (name/sku/category/unit/cost).
        Use get_item(id) for the full record (notes, shelf life, expiry,
        suppliers, default location, etc)."""
        return self._get_all_pages('/items/', params=params)

    def get_item(self, item_id):
        return self._request('GET', f'/items/{item_id}/')

    def get_units(self):
        return self._request('GET', '/items/units/')

    def get_unit_conversions(self):
        """Global 1-<from> = <factor> <to> factors (same-category only, e.g.
        1 tbsp = 14.7868 ml). Density-dependent conversions (Tbs → g for a
        specific ingredient) are NOT here — those are Cookbook's per-SKU
        ItemConversionLine data."""
        return self._request('GET', '/items/conversions/')

    def get_stores(self, params=None):
        return self._get_all_pages('/stores/', params=params)

    def get_prep_kitchens(self, params=None):
        """The dedicated /prep-kitchens/ endpoint is empty on the current
        deployment — prep kitchens are modelled as stores with
        store_type='production'. Try the dedicated endpoint first, fall back
        to filtering stores."""
        try:
            kitchens = self._get_all_pages('/prep-kitchens/', params=params)
            if kitchens:
                return kitchens
        except InventoryAPIError:
            pass
        params = {**(params or {}), 'store_type': 'production'}
        return self._get_all_pages('/stores/', params=params)

    # ── write: recipe content (not wired yet — see plan Stage 8) ──────────
    def create_production_recipe(self, payload):
        return self._request('POST', '/recipes/production/', json=payload)

    def update_production_recipe(self, recipe_id, payload):
        return self._request('PATCH', f'/recipes/production/{recipe_id}/', json=payload)

    def create_dish_recipe(self, payload):
        return self._request('POST', '/recipes/dish/', json=payload)

    def update_dish_recipe(self, recipe_id, payload):
        return self._request('PATCH', f'/recipes/dish/{recipe_id}/', json=payload)
