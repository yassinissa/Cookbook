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
        Walks every page: the recipe editor's ingredient picker wants the whole
        SKU set in memory. Use search_items() for a browsable, paged view."""
        return self._get_all_pages('/items/', params=params)

    def search_items(self, params=None):
        """One page of items, straight through — `search`, `category`, `page`,
        `page_size` pass to inventory-platform's DRF list endpoint. Returns its
        `{count, next, previous, results}` envelope unchanged."""
        allowed = ('search', 'category', 'item_type', 'is_active', 'page', 'page_size', 'ordering')
        clean = {k: params[k] for k in allowed if params and params.get(k) not in (None, '')}
        clean.setdefault('page_size', 40)
        return self._request('GET', '/items/', params=clean)

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

    # ── write: recipe content (apps.cookbook.publishing) ─────────────────
    # The platform's recipe write serializers do NOT echo the row `id` (they
    # reuse the write serializer for the response, and `id` isn't a write
    # field), so after a create the caller looks the row up by name via
    # find_*_recipe below.
    def create_production_recipe(self, payload):
        return self._request('POST', '/recipes/production/', json=payload)

    def update_production_recipe(self, recipe_id, payload):
        return self._request('PATCH', f'/recipes/production/{recipe_id}/', json=payload)

    def create_dish_recipe(self, payload):
        return self._request('POST', '/recipes/dish/', json=payload)

    def update_dish_recipe(self, recipe_id, payload):
        return self._request('PATCH', f'/recipes/dish/{recipe_id}/', json=payload)

    def find_dish_recipe(self, name_en):
        rows = self._get_all_pages('/recipes/dish/', params={'search': name_en})
        return next((r for r in rows
                     if r.get('name_en') == name_en and r.get('is_current')), None)

    def find_production_recipe(self, name_en, prep_kitchen_id):
        rows = self._get_all_pages('/recipes/production/')
        return next((r for r in rows
                     if r.get('name_en') == name_en
                     and str(r.get('prep_kitchen')) == str(prep_kitchen_id)
                     and r.get('is_current')), None)

    # ── write: POS mappings (apps.cookbook.publishing, slice 3c) ─────────
    # inventory-platform's pos_integration deducts stock from an uploaded Lavu
    # "Sales by Item" report; it needs a POSItemMapping per (item, modifier)
    # and a POSAddonIngredient per paid add-on. Cookbook authors these beside
    # the recipe and pushes them here. Both keys are unique on the platform,
    # so these upsert: find by the key, PATCH if present else POST.
    def upsert_pos_mapping(self, pos_item_name, pos_modifier, dish_recipe_id):
        payload = {
            'pos_item_name': pos_item_name,
            'pos_modifier': pos_modifier or '',
            'dish_recipe': dish_recipe_id,
            'is_mapped': True,
        }
        existing = next(
            (r for r in self._get_all_pages('/pos/mappings/', params={'search': pos_item_name})
             if r.get('pos_item_name') == pos_item_name
             and (r.get('pos_modifier') or '') == (pos_modifier or '')),
            None)
        if existing:
            return self._request('PATCH', f'/pos/mappings/{existing["id"]}/', json=payload)
        return self._request('POST', '/pos/mappings/', json=payload)

    def upsert_pos_addon(self, modifier_name, item_id, quantity, unit_id=None):
        payload = {
            'modifier_name': modifier_name,
            'item': item_id,
            'quantity': str(quantity),
            'unit': unit_id,
        }
        existing = next(
            (r for r in self._get_all_pages('/pos/addons/', params={'search': modifier_name})
             if r.get('modifier_name') == modifier_name),
            None)
        if existing:
            return self._request('PATCH', f'/pos/addons/{existing["id"]}/', json=payload)
        return self._request('POST', '/pos/addons/', json=payload)
