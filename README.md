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
