# Hardening worklist

Production-readiness work agreed 2026-09-08. One PR per item, most-critical
first. Tick items off as their PR merges; this file is the running tracker so
the work survives across sessions.

Legend: ☐ not started · ◐ in progress (branch open) · ☑ merged

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
- ☐ **Reconcile prod ↔ `main` drift** — `fix/health-check-drift`. Live
  `/api/health/` returns debug fields (`cors_all`, `settings`, `middleware_0`)
  that aren't in `config/urls.py` on `main`. Someone hot-patched prod to chase
  a CORS/settings issue. Diff prod against `main`, fold anything real into a
  commit, redeploy so they match. While here, make the health check verify DB
  connectivity.
- ☐ **`sync_capabilities` on every deploy** — `chore/sync-capabilities-deploy`.
  Add it to the `cookbook-api` `buildCommand` after `migrate` (idempotent).
  Removes the "forgot the capability migration" foot-gun.

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

- ☐ **Ship the modifier pipeline to prod** — the standing `DEPLOY.md` §2–3
  work: deploy both services (migrations run), `backfill_wnr_modifiers
  --commit`, re-publish WnR dishes, chef fills ~24 quantities on POS →
  Readiness, final Lavu-report verify.
- ☐ **SMTP env for the cost-digest cron** — `cookbook-shared` group
  (`EMAIL_HOST` etc.). Reuse inventory-platform's Gmail app-password.
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
