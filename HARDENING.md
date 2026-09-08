# Hardening worklist

Production-readiness work agreed 2026-09-08. One PR per item, most-critical
first. Tick items off as their PR merges; this file is the running tracker so
the work survives across sessions.

Legend: ☐ not started · ◐ in progress (branch open) · ☑ merged · ✗ dropped

**Tooling available to this work:** `gh` CLI (authed), Python 3.12.10 local
venv, `RENDER_API_KEY` in `.claude/settings.local.json` (read-only use — list
services / read config + logs / check deploys), `inventory_platform` cloned at
`C:\Users\lenovo\Desktop\inventory_platform`. Still needed: two Sentry DSNs.

---

## Tier 1 — critical (do first)

- ☑ **Pin the local dev runtime to Python 3.12** — PR #13, merged 2026-09-08.
  Every runtime pin aligned on **3.12.10**: `.python-version`,
  `backend/runtime.txt`, both `render.yaml` `PYTHON_VERSION` values, plus
  `frontend/.nvmrc` = 24 and `engines.node`. **Local venv must be recreated
  on 3.12** (`cd backend && rm -rf venv && py -3.12 -m venv venv && ...`).
- ☑ **CI** — PR #15 (was #14, auto-closed on base-branch delete), merged
  2026-09-08. GitHub Actions on push to `main` + every PR: backend
  `manage.py test` + `makemigrations --check` on Python `3.12`, frontend
  `typecheck` + `lint` + `build` on Node 24. `.gitattributes` LF
  normalisation. First green run: 179 tests, 0 failures on 3.12.
- ☐ **Production observability** — `chore/prod-observability`. `production.py`
  has no `LOGGING` block and no error tracking. Add Sentry (`sentry-sdk` +
  `@sentry/react`, gated on `SENTRY_DSN`) and a real `LOGGING` config that
  ships WARN+ to stdout with structured context for the publish + cron paths.
- ✗ **~~Reconcile prod ↔ `main` drift~~** — NOT A COOKBOOK ISSUE (checked via
  Render API 2026-09-08). Cookbook's API is `cookbook-api-do9z.onrender.com`
  and its `/api/health/` returns exactly `{"status": "ok"}` — matches `main`.
  The debug fields (`cors_all`, `settings`, `middleware_0`) are on
  `greenhill-api-sljm…` = **inventory-platform's** health endpoint, a
  different repo (the README lists that URL, which is what misled the first
  pass). inventory_platform has uncommitted local drift worth a look, but
  separately.
- ☑ **`sync_capabilities` on every deploy** — PR #16, merged 2026-09-08.
  Added to `cookbook-api` `buildCommand` after `migrate` (idempotent, no
  `--prune`) — safety net for the "forgot the capability migration" foot-gun
  (role grants still need the migration). Also deepened `/api/health/` to a
  real `SELECT 1` → 503 on DB failure (+ `apps/core/tests/test_health.py`).
  **Takes effect on the next Blueprint sync** (buildCommand is blueprint-
  managed; a plain deploy keeps the stored one). Health-check change is code,
  so it ships on any deploy.
- ☑ **Deploy `main` to prod + blueprint-sync** — done 2026-09-08. Blueprint
  synced + redeployed; prod `cookbook-api` build log confirms: Python
  **3.12.10**, `sync_capabilities` ran (`0 created, 24 updated` — no drift),
  `migrate` = "No migrations to apply" (prod DB fully current, incl.
  0025/0026). Health endpoint clean.

## Tier 2 — robustness

- ☐ **PWA offline story** — `vite.config.ts` sets no `runtimeCaching` /
  `navigateFallback`; the SW precaches build assets only. On a kitchen iPad
  with spotty wifi every API call fails with no fallback. Add read-through
  caching for recipe/standard GETs, or explicitly scope offline out in docs.
- ☐ **Frontend smoke tests** — no test runner at all. Vitest + Testing
  Library: render every route, exercise the mutation happy-paths.
- ☐ **Prod media serving** — `production.py` itself notes MEDIA (dish/plating
  photos) isn't served (the `static()` route is DEBUG-only), yet `render.yaml`
  mounts a disk for it. Either add a media route/WhiteNoise-media, or move to
  object storage (S3/R2). Right now uploaded photos 404 in prod.
- ☐ **Cron failure alerting** — `send_cost_digest` silently no-op'd for days
  (unset SMTP). Whatever observability lands in Tier 1 should page on a cron
  that errors or is skipped N weeks running.
- ☐ **DB backup/restore runbook** — not documented. Confirm Render's automatic
  backups are on for `cookbook-db` and write the restore steps.

## Tier 3 — cleanup / debt

- ◐ **Finish the modifier pipeline in prod** — migrations already applied
  (verified via Render API 2026-09-08): Cookbook `0025`/`0026` shipped in the
  `06b52a6` deploy on 2026-09-07, inventory-platform `0007`/`0008` in the
  `8f852f1` deploy same day. **DEPLOY.md §2–3 "not yet run in prod" is stale.**
  What actually remains: (1) `python manage.py backfill_wnr_modifiers --commit`
  on Cookbook prod (one-off, not auto-run), (2) re-publish WnR dishes so
  `POSModifierIngredient` rows reach inventory-platform (`INVENTORY_API_*` are
  set), (3) chef fills ~24 quantities on POS → Readiness, (4) final
  Lavu-report verify.
- ☐ **SMTP env for the cost-digest cron** — CONFIRMED missing (Render API
  2026-09-08): the `cookbook-shared` env group has only `EMAIL_PORT` +
  `EMAIL_USE_TLS`. Need `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
  `DEFAULT_FROM_EMAIL`. Reuse inventory-platform's Gmail app-password.
- ☐ **WNR1 stock + ingredient backfills** — the two runbooks in repo root,
  run from the inventory-platform Render shell.
- ☐ **Confirm / close the prod WnR base-recipe gap** — ~60 report items have
  no Cookbook recipe unless `seed_wnr_demo` was run against prod (it wasn't,
  per `DEPLOY.md` §5). Decide: author them, or accept the gap.
- ☐ **`seed_pos_recipes.py` is dead on a clean DB** — references removed
  `ItemCategory.CHILLER_FREEZER`. Fix or delete.
- ☐ **Crispy Salad add-on → non-existent SKU `556`** (`DEPLOY.md` §5).
- ☐ **Ingredient conversion gaps** — backlog of missing tbsp/piece-gram data
  leaving recipe lines `no_conversion` (see `ingredient-conversion-gaps` memo).
- ☐ **`POSAddonIngredient` removal** — deprecated in both repos, "keep one
  release then drop."
- ☐ **Accessibility audit** — never run. Kitchen context (glare, gloves,
  speed, iOS-15 iPads) makes target size + contrast high-value.
- ☐ **Security review** — run `security-review` over the recent
  modifier/publish branches; the inventory service account is SUPER_ADMIN
  (broad blast radius) — consider a narrower role.
- ☐ **Redis for cache + throttle** — prerequisite for running the API on more
  than one worker/instance (public-menu throttle + cache-bust are per-process
  today; `render.yaml` comments already acknowledge this).
