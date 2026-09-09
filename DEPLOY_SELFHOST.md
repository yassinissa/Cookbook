# Self-hosting Cookbook (moving off Render)

Cookbook is a Django REST API + a Vite/React static frontend + one Postgres +
one weekly cron. This doc covers moving it to a VPS you rent once and pay a
flat monthly fee for — on its own, or on the same box as `inventory-platform`
and future systems.

The container files this repo now ships:

| File | What it is |
|---|---|
| `backend/Dockerfile` + `backend/entrypoint.sh` | Builds the API image. Boot = wait-for-db → migrate → collectstatic → sync_capabilities → gunicorn. |
| `frontend/Dockerfile` + `frontend/nginx.conf` | Builds the SPA and serves it with nginx. `VITE_API_BASE_URL` is a **build arg**. |
| `docker-compose.yml` + `Caddyfile` | One-command standalone stack (db + api + web + auto-HTTPS). |
| `.env.docker.example` | Every setting, with notes. Copy to `.env`. |

---

## 0. Prerequisites (one-time, ~1 hour)

1. **A domain.** You need real DNS names — `cookbook.<domain>`,
   `api-inventory.<domain>`, etc. (Sub-domains only; the main site and email
   are untouched.)
2. **A server.** Smallest tier is plenty to start:
   - **Hetzner Cloud CX22** — ~€4/mo, 2 vCPU / 4 GB. Cheapest; needs a quick ID check.
   - **DigitalOcean** 2 GB droplet — ~$12/mo. Easier signup, more tutorials.
   - Ubuntu 24.04 LTS.
3. **DNS records** (ask whoever manages the domain):

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `cookbook` | `<SERVER_IP>` | 300 |
   | A | `inventory` | `<SERVER_IP>` | 300 |
   | A | `api-inventory` | `<SERVER_IP>` | 300 |

   On Cloudflare: **grey cloud (DNS only)** until HTTPS is confirmed working.
4. On the server:
   ```sh
   apt update && apt install -y docker.io docker-compose-v2 git
   systemctl enable --now docker
   ```

---

## Path A — Coolify (recommended)

Coolify is "self-hosted Render": git-push deploys, automatic HTTPS, a Postgres
you click to create, log viewer, scheduled tasks. **One flat server cost no
matter how many apps.**

1. Install: `curl -fsSL https://cdn.coolify.io/coolify/install.sh | bash`
   then open `http://<SERVER_IP>:8000` and finish setup.
2. **Add a Postgres** resource. In it create two databases: `cookbook`,
   `inventory_db` (one server can host both apps' data).
3. **Add Cookbook API**: New Resource → Public Repository → this repo →
   Build Pack: **Dockerfile**, path `backend/Dockerfile`, base dir `/backend`.
   - Set the domain to `https://cookbook.<domain>` with **path `/api`** (so
     `/api/*` goes to the backend) — or give it its own `api-cookbook.<domain>`.
   - Env vars: see the checklist below.
   - Health check path: `/api/health/`.
4. **Add Cookbook frontend**: same repo, Dockerfile `frontend/Dockerfile`,
   base dir `/frontend`. Add a **build arg** `VITE_API_BASE_URL` =
   `https://cookbook.<domain>/api`. Domain `https://cookbook.<domain>` (catch-all
   path).
5. **Scheduled task** on the API resource:
   `python manage.py send_cost_digest` — cron `0 4 * * 1`.
6. Deploy. Coolify pulls the cert and routes everything.

Repeat 3–5 for `inventory-platform` (it already has `backend/Dockerfile`).
Point Cookbook's `INVENTORY_API_BASE_URL` at the inventory container's internal
name, e.g. `http://greenhill-api:8000/api` — no public round-trip.

---

## Path B — plain docker-compose (no Coolify)

Rawer, but it's genuinely one file. Good if you only ever run these two apps.

```sh
git clone <this repo> cookbook && cd cookbook
cp .env.docker.example .env
nano .env            # fill in COOKBOOK_DOMAIN, SECRET_KEY, DB_PASSWORD, ...
docker compose up -d --build
docker compose logs -f api      # watch the boot sequence
```

Caddy fetches the HTTPS cert on first boot (needs ports 80/443 open + DNS
pointing here). Visit `https://cookbook.<domain>`.

**Both apps on one box, one Caddy:** run this compose without its `caddy`
service, run `inventory-platform`'s stack the same way, and put a single Caddy
in its own tiny compose that `reverse_proxy`es each app by domain over a shared
external Docker network. (Ask and I'll generate that shared-proxy compose.)

---

## Environment variables — carry these over from Render

Get the current values from **Render → each service → Environment**. Critical:
**reuse `SECRET_KEY` exactly** (changing it invalidates every session).

| Var | Value on the new host |
|---|---|
| `SECRET_KEY` | **same as Render** |
| `DJANGO_SETTINGS_MODULE` | `config.settings.production` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | your new Postgres (compose: from `.env`; Coolify: from the resource) |
| `DB_HOST` / `DB_PORT` | compose: `db` / `5432` · Coolify: the Postgres internal host |
| `ALLOWED_HOSTS` | `cookbook.<domain>,localhost,127.0.0.1` (localhost is for the in-container healthcheck) |
| `CORS_ALLOWED_ORIGINS` | `https://cookbook.<domain>` |
| `CSRF_TRUSTED_ORIGINS` | `https://cookbook.<domain>` |
| `FRONTEND_URL` | `https://cookbook.<domain>` |
| `PUBLIC_MENU_BASE_URL` | `https://cookbook.<domain>` |
| `VITE_API_BASE_URL` *(frontend build arg)* | `https://cookbook.<domain>/api` |
| `INVENTORY_API_BASE_URL` | inventory's new URL (or internal `http://greenhill-api:8000/api`) |
| `INVENTORY_API_EMAIL` / `INVENTORY_API_PASSWORD` | **same as Render** |
| `EMAIL_HOST` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | same as Render (or set them to finally enable email) |
| `DEFAULT_FROM_EMAIL` | same |

---

## Move the data

### Database (per app)

1. Render → Postgres → **Connect** → copy the **External Connection String**.
2. On the new server (or your laptop):
   ```sh
   # dump from Render
   pg_dump "postgresql://USER:PASS@HOST/DB?sslmode=require" \
     --no-owner --no-privileges -Fc -f cookbook.dump

   # restore into the new Postgres
   #   compose:  docker compose exec -T db pg_restore ... < cookbook.dump
   #   or point at it directly:
   pg_restore --no-owner --no-privileges --clean --if-exists \
     -d "postgresql://cookbook:PASS@NEWHOST:5432/cookbook" cookbook.dump
   ```
3. The API container runs `migrate` on boot — it'll be a no-op if the dump is
   current.

### Uploaded photos (Cookbook only)

Render stores dish/plating photos on a Disk (`cookbook-media`, mounted at
`backend/media`). Copy them into the new `media` volume:

```sh
# from the Render shell (Dashboard → cookbook-api → Shell):
cd /opt/render/project/src/backend/media && tar czf /tmp/media.tgz .
# download /tmp/media.tgz, then on the new server:
docker compose cp media.tgz api:/tmp/ && \
docker compose exec api sh -c 'cd /app/media && tar xzf /tmp/media.tgz'
```

`inventory-platform` uses Cloudinary / no disk — nothing to copy there.

---

## Cutover & rollback

1. Bring the new stack up. Test login, a recipe, a photo, the public menu
   (`/m/<slug>`), and the inventory integration (open the ingredient picker).
2. **Keep Render running in parallel 3–7 days.** Zero downtime — DNS still
   points at Render until you're ready... actually: point DNS at the new
   server *now* but keep Render alive as the instant rollback (just repoint
   the A record back, 5-min TTL).
3. When happy: Render → each service → **Suspend** (not delete). Delete after
   a week. Cancel the Render Postgres plans last.

---

## Backups (you own these now)

- **Coolify**: enable scheduled Postgres backups to S3/Backblaze B2 in the
  Postgres resource settings.
- **compose**: a nightly host cron:
  ```sh
  0 3 * * * docker compose -f /root/cookbook/docker-compose.yml exec -T db \
    pg_dump -U cookbook cookbook | gzip > /root/backups/cookbook-$(date +\%F).sql.gz
  ```
  Plus copy `media_data` and `caddy_data` volumes off-box weekly.

---

## Cost, roughly

| | Render (today) | Hetzner + this setup |
|---|---|---|
| Cookbook + inventory | ~$14/mo | ~€6/mo |
| + 3 more systems | ~$35/mo | still ~€6–12/mo |
| Ops you own | none | OS updates, DB backups |
