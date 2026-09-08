# Deploy checklist

The standing list of production steps that a deploy does **not** do for you.
Tick items off and delete them as they're done — this file should only ever
describe work that is still outstanding. Architecture and the build commands
live in [`README.md`](README.md#deployment-render) and [`render.yaml`](render.yaml).

Last reviewed: **2026-09-08** (modifier pipeline + PWA reload prompt merged,
migrations + backfill still to run in prod; Documents module merged — PR #12,
frontend-only, nothing to do on deploy).

---

## 1. Render dashboard — one-time setup

The blueprint is adopted (services `cookbook-api` / `cookbook-frontend` /
`cookbook-db` / `cookbook-cost-digest` exist and are Blueprint-managed). These
`sync: false` values still need setting by hand:

| Where | Keys | Notes |
|---|---|---|
| **`cookbook-shared` env group** | `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | **Still not set** (confirmed via Render API 2026-09-08 — the group has only `EMAIL_PORT` + `EMAIL_USE_TLS`). Since PR #20 `send_cost_digest` **fails the cron** on an empty `EMAIL_HOST` rather than skipping quietly, so it will email a failure every Monday until these are set. inventory-platform's own `.env` has a working Gmail app-password setup that can be reused. Also confirm **Render → Settings → Notifications → Failed** is on. |
| **`cookbook-shared` env group** | `INVENTORY_API_BASE_URL`, `INVENTORY_API_EMAIL`, `INVENTORY_API_PASSWORD` | **Set** on `cookbook-api` (confirmed 2026-09-08). The service account **must be SUPER_ADMIN** on inventory-platform (recipe publish, POS-mapping publish, modifier-ingredient publish). |
| **`cookbook-api`** | `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `PUBLIC_MENU_BASE_URL` | `PUBLIC_MENU_BASE_URL` is the host a QR code encodes — usually the same as `FRONTEND_URL`. Without it, QR codes point at `http://localhost:5180`. |
| **`cookbook-frontend`** | `VITE_API_BASE_URL` | `https://<api host>/api`. |

## 2. Every deploy runs automatically

- **API**: `pip install -r requirements/production.txt && collectstatic &&
  migrate && sync_capabilities` — shipping a model is just a redeploy;
  `sync_capabilities` keeps the `Capability` table in step with the code
  catalogue (a role grant for a *new* capability still needs its own accounts
  migration). `cookbook` `0025`/`0026` (modifier consumption model) were
  applied by the 2026-09-07 deploy — prod is current.
- **Frontend**: `npm ci && npm run build`. It's a PWA — a new build doesn't
  reach an already-open/installed client on its own. Since PR #11 the app shows
  a dismissible **"A new version is available · Reload"** pill (on tab focus, or
  hourly) that one-taps to the new build; before PR #11, clients needed a manual
  cache clear. Nothing to do on deploy — just know users may sit a few minutes
  behind until they tap Reload. The Documents module (PR #12) is part of this
  bundle — pure frontend, no backend or env changes, gated `document.export`.
- **inventory-platform**: `pos_integration` `0007`/`0008` (the
  `POSModifierIngredient` model + data copy from `POSAddonIngredient`) were
  applied by its 2026-09-07 `8f852f1` deploy — that side is current too.

## 3. Manual, after the deploy that ships the modifier pipeline

The POS-modifier → stock-deduction work is **merged to both `main`s (2026-09-07,
Cookbook PRs #6–#8 / inventory-platform PR #1)**. Once both services have
deployed it, do these one-off runs:

1. **Cookbook** — structural backfill of WnR's modifier catalogue:
   ```
   python manage.py backfill_wnr_modifiers          # dry run — read the plan
   python manage.py backfill_wnr_modifiers --commit
   ```
   Safe, idempotent, no domain guessing; it only creates `needs_data` options
   (nothing deducts wrong). Prints the chef worklist afterwards.
2. **Re-publish the WnR dish recipes** (from the app's publish button, or a
   scripted loop) so the new `POSItemMapping` / `POSModifierIngredient` rows
   reach inventory-platform.
3. A chef then fills the ~24 consumption quantities on the **POS → Readiness**
   screen. The hand-off worklist — every row, its recommended action, and the
   dish's current recipe — is [`WNR_MODIFIER_WORKLIST.md`](WNR_MODIFIER_WORKLIST.md).
   Most rows are just "tick No stock impact"; the open numbers are the protein
   grams for the protein-less-base dishes and the ANGUS-Beef swaps. Re-upload a
   Lavu report to confirm every line lands on a success `deduction_note`.

## 4. Data backfills run from the Render Shell (not deploy config)

Step-by-step runbooks live in the repo root:
[`WNR1_STOCK_BACKFILL.md`](WNR1_STOCK_BACKFILL.md),
[`WNR1_INGREDIENT_BACKFILL.md`](WNR1_INGREDIENT_BACKFILL.md) — opening-stock /
ingredient-data backfills on **inventory-platform** after a sales upload showed
zero on hand.

## 5. Known gaps (not blockers)

- ~60 WnR items sold via the Lavu report have **no Cookbook recipe** at all
  (Dune, Kindo, 3zoz Maki, …). inventory-platform has them via
  `seed_pos_recipes`; Cookbook itself does not. Authoring those base recipes is
  separate from the modifier pipeline.
- The `Crispy Salad` add-on option points at a non-existent SKU (`556`) — replace
  it with the real sauce SKU on the Readiness screen.
