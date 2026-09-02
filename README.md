# Cookbook

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

Run inventory-platform's backend on `:8000` (as it already does) and run
Cookbook's own backend on a different port, e.g. `:8001`, so both APIs are
reachable at once:

```bash
# backend
cd backend
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

The API web service is configured in the Render dashboard (predates
`render.yaml`). Migrations run on deploy, so shipping a new model just needs a
redeploy.

### Weekly cost-report digest

A Monday-morning email to everyone with `costing.view` — dishes now over their
food-cost target, the week's biggest cost movers, and coverage gaps, scoped to
the branches each recipient can see. Enrolment is opt-out; users toggle it (or
one-click unsubscribe from any email) under **Settings** in the app.

- Command: `python manage.py send_cost_digest` (`--dry-run` builds and prints
  without sending; `--user <id|username>` targets one recipient and ignores the
  5-day resend guard; `--force` ignores the guard for everyone).
- Schedule: the `cookbook-cost-digest` cron in [`render.yaml`](render.yaml) —
  `0 4 * * 1` (04:00 UTC = 07:00 Asia/Kuwait). Apply via **New → Blueprint**, or
  add the same command as a cron job by hand in the dashboard.
- Env: the cron needs the same `SECRET_KEY` + `DB_*` as the web service, plus
  SMTP (`EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
  `DEFAULT_FROM_EMAIL`) and `FRONTEND_URL` (no trailing slash — backs the email
  links). Dev sends nothing: `development.py` forces the console email backend.
