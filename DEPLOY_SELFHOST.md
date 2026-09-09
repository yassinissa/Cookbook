# Self-hosting Cookbook (moving off Render)

Cookbook is a Django REST API + a Vite/React static frontend + one Postgres +
one weekly cron. This doc covers putting it on the real domain and moving it
to a VPS you rent at a flat monthly fee — on its own, or on the same box as
`inventory-platform` and future systems.

Container files this repo ships:

| File | What it is |
|---|---|
| `backend/Dockerfile` + `backend/entrypoint.sh` | API image. Boot = wait-for-db → migrate → collectstatic → sync_capabilities → gunicorn. |
| `frontend/Dockerfile` + `frontend/nginx.conf` | Builds the SPA, serves it with nginx. `VITE_API_BASE_URL` is a **build arg**. |
| `docker-compose.yml` + `Caddyfile` | One-command stack (db + api + web + auto-HTTPS). |
| `.env.docker.example` | Every setting, annotated. Copy to `.env`. |

---

## The domain — `greenhillskw.co`

- **DNS is at GoDaddy** (`ns0*.domaincontrol.com`). Records get added in the
  GoDaddy DNS panel.
- Root + `www` → the company website (Duda). **Do not touch.**
- Email → Microsoft 365 (`MX`, `autodiscover`, SPF `TXT`). **Do not touch.**
- We only **add new subdomains**. They can't affect the website or email.

### Subdomains (same names on Render now AND on the VPS later)

| Subdomain | Serves |
|---|---|
| `cookbook.greenhillskw.co` | Cookbook frontend |
| `cookbook-api.greenhillskw.co` | Cookbook API |
| `inventory.greenhillskw.co` | inventory-platform frontend |
| `inventory-api.greenhillskw.co` | inventory-platform API |

Using the same names for both phases means the VPS migration is a **single
DNS record change**, with the `.onrender.com` URLs as instant rollback.

---

## Phase 1 — put the domain on the CURRENT Render setup (do this first)

### 1a. DNS — hand this to the domain admin

Add these **CNAME** records in GoDaddy (**Name** = just the label; leave the
existing site/email records alone):

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `cookbook` | `cookbook-frontend-ggzu.onrender.com` | 1 Hour |
| CNAME | `cookbook-api` | `cookbook-api-do9z.onrender.com` | 1 Hour |
| CNAME | `inventory` | `greenhill-app.onrender.com` | 1 Hour |
| CNAME | `inventory-api` | `greenhill-api-sljm.onrender.com` | 1 Hour |

(When you add the domain in Render it may show a slightly different CNAME
target — use whatever Render displays.)

### 1b. Render — add the custom domains

For each of the 4 services: **Settings → Custom Domains → Add Custom Domain**,
enter the matching name, wait for "Certificate Issued" (~10 min after DNS
resolves).

### 1c. Render — update env vars

**`cookbook-api`** (Environment tab):
- `ALLOWED_HOSTS` → add `cookbook-api.greenhillskw.co`
- `CORS_ALLOWED_ORIGINS` → `https://cookbook.greenhillskw.co`
- `CSRF_TRUSTED_ORIGINS` → `https://cookbook.greenhillskw.co,https://cookbook-api.greenhillskw.co`
- `FRONTEND_URL` → `https://cookbook.greenhillskw.co`
- `PUBLIC_MENU_BASE_URL` → `https://cookbook.greenhillskw.co`
- `INVENTORY_API_BASE_URL` → `https://inventory-api.greenhillskw.co/api`

**`cookbook-frontend`**: `VITE_API_BASE_URL` → `https://cookbook-api.greenhillskw.co/api`
then **Manual Deploy → Clear build cache & deploy** (the API URL is baked into
the bundle).

**`greenhill-api`**:
- `ALLOWED_HOSTS` → add `inventory-api.greenhillskw.co`
- `CORS_ALLOWED_ORIGINS` → `https://inventory.greenhillskw.co`
- `CSRF_TRUSTED_ORIGINS` → `https://inventory.greenhillskw.co,https://inventory-api.greenhillskw.co`

**`greenhill-app`**: `VITE_API_URL` → `https://inventory-api.greenhillskw.co/api`
then redeploy.

### 1d. Verify
Log in on `https://cookbook.greenhillskw.co`, open a recipe + photo, load the
public menu, open the ingredient picker (exercises the inventory link). The
`.onrender.com` URLs keep working the whole time.

---

## Phase 2 — move to a VPS

### 2a. Server + Docker

- **Hetzner Cloud CX22** (~€4/mo, 2 vCPU / 4 GB) or a DigitalOcean 2 GB droplet.
  Ubuntu 24.04.
- ```sh
  apt update && apt install -y docker.io docker-compose-v2 git postgresql-client
  systemctl enable --now docker
  ```

### 2b. Repoint DNS

Change the 4 CNAMEs above to **A records** → `<SERVER_IP>` (TTL 5 min for the
cutover). The `.onrender.com` services stay up as rollback.

### Path A — Coolify (recommended)

"Self-hosted Render": git-push deploys, automatic HTTPS, click-to-create
Postgres, scheduled tasks. One flat server cost regardless of app count.

1. `curl -fsSL https://cdn.coolify.io/coolify/install.sh | bash`, then open
   `http://<SERVER_IP>:8000`.
2. **Add a Postgres** resource → create databases `cookbook` and `inventory_db`.
3. **Cookbook API**: New Resource → this repo → Build Pack **Dockerfile**,
   file `backend/Dockerfile`, base dir `/backend`. Domain
   `https://cookbook-api.greenhillskw.co`. Health check `/api/health/`.
   Env: the checklist below.
4. **Cookbook frontend**: same repo, `frontend/Dockerfile`, base dir
   `/frontend`, build arg `VITE_API_BASE_URL=https://cookbook-api.greenhillskw.co/api`,
   domain `https://cookbook.greenhillskw.co`.
5. **Scheduled task** on the API resource: `python manage.py send_cost_digest`,
   cron `0 4 * * 1`.
6. Repeat 3–5 for `inventory-platform` (it has `backend/Dockerfile`), plus its
   own crons: `check_alerts`, `geocode_locations`, `send_digest --period weekly`,
   `send_digest --period monthly`.
7. Point Cookbook's `INVENTORY_API_BASE_URL` at the inventory container's
   internal name — e.g. `http://greenhill-api:8000/api` — no public round-trip.

### Path B — plain docker-compose

```sh
git clone <this repo> cookbook && cd cookbook
cp .env.docker.example .env
nano .env            # COOKBOOK_DOMAIN, COOKBOOK_API_DOMAIN, SECRET_KEY, DB_PASSWORD, ...
docker compose up -d --build
docker compose logs -f api      # watch the boot sequence
```
Caddy fetches both certs on first boot (ports 80/443 open, DNS pointing here).

**Both apps + one Caddy:** run this compose without its `caddy` service, run
`inventory-platform`'s stack the same way, and put a single Caddy in its own
small compose that `reverse_proxy`es each subdomain to the right container over
a shared external Docker network. (Ask and I'll generate it.)

---

## Environment variables — carry these over from Render

Get current values from **Render → each service → Environment**.
**Reuse `SECRET_KEY` exactly** (changing it logs everyone out).

| Var | Value |
|---|---|
| `SECRET_KEY` | **same as Render** |
| `DJANGO_SETTINGS_MODULE` | `config.settings.production` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | new Postgres (compose: `.env`; Coolify: the resource) |
| `DB_HOST` / `DB_PORT` | compose: `db` / `5432` · Coolify: the Postgres internal host |
| `ALLOWED_HOSTS` | `cookbook-api.greenhillskw.co,localhost,127.0.0.1` |
| `CORS_ALLOWED_ORIGINS` | `https://cookbook.greenhillskw.co` |
| `CSRF_TRUSTED_ORIGINS` | `https://cookbook.greenhillskw.co,https://cookbook-api.greenhillskw.co` |
| `FRONTEND_URL` | `https://cookbook.greenhillskw.co` |
| `PUBLIC_MENU_BASE_URL` | `https://cookbook.greenhillskw.co` |
| `VITE_API_BASE_URL` *(frontend build arg)* | `https://cookbook-api.greenhillskw.co/api` |
| `INVENTORY_API_BASE_URL` | `https://inventory-api.greenhillskw.co/api` (or internal `http://greenhill-api:8000/api`) |
| `INVENTORY_API_EMAIL` / `INVENTORY_API_PASSWORD` | **same as Render** |
| `EMAIL_HOST` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | same as Render (or set to finally enable email) |
| `DEFAULT_FROM_EMAIL` | `Cookbook <cookbook@greenhillskw.co>` |

---

## Move the data

### Database (per app)

1. Render → the Postgres → **Connect** → copy the **External Connection String**.
2. ```sh
   pg_dump "postgresql://USER:PASS@HOST/DB?sslmode=require" \
     --no-owner --no-privileges -Fc -f cookbook.dump

   # into the new Postgres (compose: run from the host, port-forward or exec):
   pg_restore --no-owner --no-privileges --clean --if-exists \
     -d "postgresql://cookbook:PASS@NEWHOST:5432/cookbook" cookbook.dump
   ```
3. The API runs `migrate` on boot — a no-op if the dump is current.

### Uploaded photos (Cookbook only)

Render stores dish/plating photos on a Disk (`cookbook-media` at `backend/media`):

```sh
# Render shell (Dashboard → cookbook-api → Shell):
cd /opt/render/project/src/backend/media && tar czf /tmp/media.tgz .
# download it, then on the new server:
docker compose cp media.tgz api:/tmp/ && \
docker compose exec api sh -c 'cd /app/media && tar xzf /tmp/media.tgz'
```

`inventory-platform` uses Cloudinary / no disk — nothing to copy.

---

## Cutover & rollback

1. Bring the new stack up (DNS still on Render). Test with the `.onrender.com`
   URLs or a `hosts`-file override.
2. Flip the 4 DNS records CNAME→A → `<SERVER_IP>`. 5-min TTL.
3. Watch for a few days. Rollback = point the records back at Render.
4. When happy: Render → each service → **Suspend** (not delete). Delete after a
   week; cancel the Render Postgres plans last.

---

## Backups (you own these now)

- **Coolify**: enable scheduled Postgres backups to S3 / Backblaze B2 in the
  Postgres resource settings.
- **compose**: nightly host cron —
  ```sh
  0 3 * * * docker compose -f /root/cookbook/docker-compose.yml exec -T db \
    pg_dump -U cookbook cookbook | gzip > /root/backups/cookbook-$(date +\%F).sql.gz
  ```
  Plus copy the `media_data` and `caddy_data` volumes off-box weekly.

---

## Cost, roughly

| | Render (today) | Hetzner + this setup |
|---|---|---|
| Cookbook + inventory | ~$14/mo | ~€6/mo |
| + 3 more systems | ~$35/mo | still ~€6–12/mo |
| Ops you own | none | OS updates, DB backups |
