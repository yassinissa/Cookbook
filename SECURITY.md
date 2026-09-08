# Security review — backend

First pass, 2026-09-08. Manual review of the exposed surface: the
unauthenticated endpoints, auth/session handling, the inventory-platform
integration, file uploads, secrets, and the Render deployment config.

Legend: ☑ fixed (PR #22) · ☐ open

---

## 1. Fixed in this pass

- ☑ **No rate limiting anywhere except the public menu.** `/api/auth/login/`
  (JWT) had no throttle — unlimited password brute-force / credential
  stuffing. Added global `AnonRateThrottle` (60/min) + `UserRateThrottle`
  (600/min) and a scoped `login` throttle (10/min) on a new
  `ThrottledLoginView`. All rates are env-overridable
  (`THROTTLE_ANON` / `THROTTLE_USER` / `THROTTLE_LOGIN`). Disabled in
  dev/test settings so fast test loops don't 429.
- ☑ **Missing production security headers.** `production.py` only set
  `SECURE_SSL_REDIRECT` + secure cookies. Added:
  - `SECURE_PROXY_SSL_HEADER` — **Render terminates TLS at its edge**, so
    without this Django saw every request as insecure (secure-cookie / HSTS
    logic misfires, `SECURE_SSL_REDIRECT` can loop).
  - `SECURE_HSTS_SECONDS` (1h default — raise to a year + preload once
    stable), `SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_REFERRER_POLICY`,
    explicit `X_FRAME_OPTIONS = 'DENY'`.
- ☑ **Image upload trusted the client MIME type.** `apply_image_data` /
  `_decode_image` decoded the base64 and checked size against a 5-type
  extension whitelist, but never opened the bytes. A script / HTML blob
  labelled `image/png` was written straight to `MEDIA_ROOT`. Added
  `verify_image_bytes()` — Pillow `verify()` + format re-check + a 40 MP
  pixel cap (decompression-bomb guard). SVG is rejected (not an
  `Image`-openable raster).

## 2. Open — needs a change or a decision

- ☐ **No real logout / token revocation.** `rest_framework_simplejwt.token_blacklist`
  is **not** in `INSTALLED_APPS`, so `BLACKLIST_AFTER_ROTATION: True` is a
  no-op and there is no logout endpoint — the frontend just drops the token
  client-side. On a shared kitchen tablet a retained access token works for
  up to 60 min and the refresh token for 7 days. Fix: add the app + migration,
  a `POST /api/auth/logout/` that blacklists the refresh token, and have the
  frontend `logout()` call it.
- ☐ **Digest unsubscribe is a state-changing `GET`.** `GET .../unsubscribe/<token>/`
  sets the subscription to OFF. Email link-scanners / prefetchers that follow
  the link will silently unsubscribe users. The token is a v4 UUID (not
  enumerable) and the action is reversible in Settings, so low harm — but it
  should be a confirmation page with a `POST`, or at least carry the
  `public_menu`-style throttle. No injection risk (the HTML template
  interpolates only hard-coded strings).
- ☐ **Inventory service account is SUPER_ADMIN on inventory-platform.** It
  actually needs: read `items` / `units` / `stores` / `prep-kitchens`, and
  write `recipes/dish` + `recipes/production` + `pos/mappings` +
  `pos/modifier-ingredients`. A dedicated "cookbook-integration" role with
  exactly those grants would shrink the blast radius from "can delete any
  store / manage users" to "can write recipes". Cross-repo (inventory-platform
  RBAC) — do it carefully with their role model.
- ☐ **DB `ipAllowList` is `0.0.0.0/0`.** `cookbook-db` accepts connections
  from any IP (also in `HARDENING.md` / `DB_BACKUP.md`). Restrict to Render's
  egress range + known operator IPs before real customer data.
- ☐ **Throttle + public-menu cache are per-process (LocMem).** Correct only
  while the API runs one gunicorn worker on one dyno (it does). Scaling out
  fragments the throttle counters and the cache-bust — move to Redis first
  (`HARDENING.md`).
- ☐ **`InventoryAPIError` messages include the upstream `resp.text`.** If
  those ever get surfaced to an end user or an unfiltered log they could leak
  inventory-platform internals. Low; there's no logging config yet anyway.

## 3. Checked — no action needed

- **SQL injection** — ORM only; no `.raw()` / `.extra()` / `cursor.execute`
  / string-built SQL anywhere in app code.
- **Secrets** — no `.env`, keys, or hard-coded `SECRET_KEY` in git;
  `.gitignore` covers `backend/.env`; `SECRET_KEY` is `generateValue` on
  Render. The inventory password is plain-text env (unavoidable for the
  integration) and is not logged (it's in the request body, not the error).
- **Public menu payload** — hand-written whitelist, no cost/margin/supplier
  fields; `test_menu_editions_api.py` walks the response recursively to prove
  it. QR endpoint only ever encodes `<FRONTEND>/m/<validated-slug>`.
- **CORS** — `production.py` uses an explicit `CORS_ALLOWED_ORIGINS` list, not
  `CORS_ALLOW_ALL_ORIGINS`.
- **`DEBUG`** — `False` in prod, `ALLOWED_HOSTS` set (verified via the Render
  API). Django admin is session-auth + now behind the same login throttle
  surface via `SecurityMiddleware` ordering.
- **The `^media/` serve route** (PR #17) — `django.views.static.serve` uses
  `safe_join`, so `../` traversal is blocked; Content-Type is set from the
  (whitelisted) extension, not sniffed, so a mislabelled upload can't run as
  HTML — and `SECURE_CONTENT_TYPE_NOSNIFF` (added here) closes the gap fully.
- **Excel import** (`openpyxl`) — no external-entity / formula-eval exposure
  on read.
