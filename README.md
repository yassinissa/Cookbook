# Cookbook

![CI](https://github.com/yassinissa/Cookbook/actions/workflows/ci.yml/badge.svg)

Recipe authoring system for Green Hills, split into two phases:

- **Preparation** — prep-kitchen recipes (raw materials → prepared product)
- **Restaurant** — branch dish recipes (prepared/raw items → menu dish)

## How this connects to inventory-platform

Cookbook does **not** duplicate the item/store master data. Instead:

- **Reads** items, units, stores, and prep kitchens live from the
  inventory-platform REST API, so a recipe can only reference SKUs that
  actually exist there.
- **Writes** finished recipes back to inventory-platform's
  `ProductionRecipe` / `DishRecipe` endpoints (`/api/recipes/production/`,
  `/api/recipes/dish/`), replacing what used to be typed by hand into its
  admin.

All of that integration lives in one place:
[`backend/apps/integrations/inventory_client.py`](backend/apps/integrations/inventory_client.py).

Cookbook's own database only stores what inventory-platform doesn't track —
the actual "how to cook it" content (steps, photos, technique, notes). That
model is intentionally not built yet; it's shaped by the source Excel
cookbook sheet.

## Stack

Same as inventory-platform, for consistency: Django REST Framework backend,
React + Vite + Tailwind frontend.

## Local development

**Runtime versions are pinned.** Python **3.12** (`.python-version` /
`backend/runtime.txt` — Django 4.2 doesn't support 3.13+) and Node **24**
(`frontend/.nvmrc`). With `pyenv` / `nvm` installed they're picked up
automatically; otherwise install those versions by hand. A venv built on the
wrong Python shows up as spurious test errors (e.g. 502-path failures on 3.14).

Run inventory-platform's backend on `:8000` (as it already does) and run
Cookbook's own backend on a different port, e.g. `:8001`, so both APIs are
reachable at once:

```bash
# backend
cd backend
pyenv install -s 3.12.10           # if pyenv is installed
python -m venv venv && source venv/Scripts/activate  # Windows Git Bash
pip install -r requirements/development.txt
cp .env.example .env   # then fill in INVENTORY_API_USERNAME/PASSWORD
python manage.py migrate
python manage.py runserver 8001

# seed the reference data (categories, sections, units, allergens, …)
python manage.py seed_cookbook_reference_data
python manage.py createsuperuser

# frontend  (pinned to :5180 — :5173 is taken by the sibling Host Stand app)
cd frontend
npm install
cp .env.example .env
npm run dev
```

`.env` needs `INVENTORY_API_BASE_URL` pointing at a running inventory-platform
API (local `:8000`, or the deployed `https://greenhill-api-sljm.onrender.com/api`)
plus `INVENTORY_API_EMAIL` / `INVENTORY_API_PASSWORD` for a service account there.

## Deployment (Render)

Outstanding production steps (env not yet set, one-off backfills to run) are
tracked in [`DEPLOY.md`](DEPLOY.md).

[`render.yaml`](render.yaml) is a full Blueprint — Postgres, the Django API,
the weekly-digest cron, and the Vite frontend as a static site. Cookbook
shares its Render account with inventory-platform, so the services here are
named `cookbook-api` / `cookbook-frontend` / `cookbook-db` — deliberately not
`greenhill-api`, which inventory-platform's own backend already uses (Render
matches blueprint services to existing ones **by name**, so reusing that name
would try to adopt inventory-platform's live API instead of creating a new
service). Connect the repo as a Blueprint (Dashboard → New → Blueprint) to
create them, or use the file as the reference for manual setup. Secrets
(`sync: false`) are set once in the dashboard; the SMTP + inventory-platform
credentials live in a shared `cookbook-shared` env group.

- **API build**: `pip install -r requirements/production.txt && collectstatic &&
  migrate && sync_capabilities` — migrations run every deploy, so shipping a
  model is just a redeploy; `sync_capabilities` keeps the `Capability` table in
  step with `apps/accounts/capabilities.py` (a new capability still needs its
  own migration to grant it to roles — see the accounts `0003`/`0004` pattern).
  WhiteNoise serves the API's own static assets (`production.py`); dish/plating
  photos (`MEDIA`) live on the Render Disk mounted at `backend/media` and are
  served by the explicit `^media/` route in `config/urls.py`. Object storage
  (S3/R2) is the move if photo volume ever grows.
- **Frontend**: `npm ci && npm run build` → `dist/`, with an SPA rewrite so
  `/m/<slug>` and every client route resolve. Set `VITE_API_BASE_URL` to the
  API's `…/api`.
- **Python**: pinned to 3.12 — Django 4.2 doesn't support 3.13+.

### Weekly cost-report digest

A Monday-morning email to everyone with `costing.view` — dishes now over their
food-cost target, the week's biggest cost movers, and coverage gaps, scoped to
the branches each recipient can see. Enrolment is opt-out; users toggle it (or
one-click unsubscribe from any email) under **Settings** in the app.

- Command: `python manage.py send_cost_digest` (`--dry-run` builds and prints
  without sending; `--user <id|username>` targets one recipient and ignores the
  5-day resend guard; `--force` ignores the guard for everyone).
- Schedule: the `cookbook-cost-digest` cron in `render.yaml` — `0 4 * * 1`
  (04:00 UTC = 07:00 Asia/Kuwait). It pulls `SECRET_KEY` / `FRONTEND_URL` from
  the API service and the DB creds from `cookbook-db`; SMTP comes from the
  `cookbook-shared` env group. Dev sends nothing — `development.py` forces the
  console email backend.

### Public QR / print menu

`POST /api/cookbook/menus/<id>/publish-edition/` (needs `menu.publish`) freezes
the effective menu for a date into an immutable `MenuEdition`. The public,
unauthenticated read is `GET /api/cookbook/public-menu/<branch-slug>/` and
`.../qr/`; the customer-facing page is the SPA route `/m/<slug>`.

- Env: `PUBLIC_MENU_BASE_URL` (the host the QR encodes — defaults to
  `FRONTEND_URL`), `PUBLIC_MENU_THROTTLE` (default `60/min`). The payload is
  served from Django's local-memory cache; set `CACHE_BACKEND` /
  `CACHE_LOCATION` only to move to Redis when a second web dyno appears.
- Every `Branch` gets a `slug` (auto-filled from `name_en`); a CDN / Cloudflare
  cache rule in front of `/api/cookbook/public-menu/` is the real load defence.
