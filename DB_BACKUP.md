# Database backup & restore

Standing reference for `cookbook-db` (the production Postgres). Unlike
`DEPLOY.md` this file isn't a checklist to burn down — keep it current.

| | |
|---|---|
| Service | `cookbook-db` · Render Postgres **18** · plan `basic_256mb` · region `oregon` |
| Dashboard | <https://dashboard.render.com/d/dpg-dackuu7avr4c73fjtjcg-a> |
| Consumers | `cookbook-api` + `cookbook-cost-digest` read `DB_*` from `cookbook-db` (blueprint `fromDatabase`) |

---

## 1. What Render does on its own

- **Daily automated backups, ~7-day retention** (Basic-plan policy). Visible
  under the database's **Recovery** tab in the dashboard.
- **No point-in-time recovery.** PITR (restore to any minute, longer
  retention) is a Pro/Accelerated-plan feature. On the current plan the
  worst case is losing up to ~24 h of writes — everything since the last
  nightly snapshot.
- Backups are internal snapshots, not files you hold. A restore spins up a
  **new** database instance from a chosen snapshot; you then cut the app over
  to it.

## 2. Take a manual backup before anything risky

Do this before a data backfill, a destructive migration, a bulk re-publish —
anything you can't cleanly reverse.

**Option A — Render dashboard:** database → **Recovery** → *Create backup* (a
manual snapshot alongside the nightly ones), or *Download* for a file you keep.

**Option B — `pg_dump` to a local file** (needs the Postgres client tools and
the external connection string from the dashboard → *Connect* → *External*):

```bash
# custom-format dump — compressed, restores selectively, ~seconds at this size
pg_dump "$COOKBOOK_DB_EXTERNAL_URL" -Fc -f cookbook-$(date +%Y%m%d-%H%M).dump

# or a plain-SQL dump if you want to eyeball it
pg_dump "$COOKBOOK_DB_EXTERNAL_URL" --no-owner --no-privileges -f cookbook-$(date +%Y%m%d-%H%M).sql
```

Keep the dump off the Render disk (local machine / cloud drive). The DB's
`ipAllowList` is currently `0.0.0.0/0`, so `pg_dump` works from any network —
see the note in §5.

## 3. Restore from a Render automated backup

1. Dashboard → `cookbook-db` → **Recovery** → pick a snapshot → **Restore**.
   Render provisions a **new** instance (`cookbook-db-<something>`); the
   original is untouched, so this is safe to try.
2. When the new instance is `available`, copy its connection fields.
3. Point the app at it — **either**:
   - **Blueprint way (preferred):** rename the new DB to `cookbook-db` isn't
     possible, so instead update `render.yaml`'s `fromDatabase` references… in
     practice the quicker path on Basic is the dashboard way below.
   - **Dashboard way:** on `cookbook-api` **and** `cookbook-cost-digest`,
     override `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_PORT`
     env vars to the restored instance, then redeploy `cookbook-api`.
4. Verify: `GET https://cookbook-api-do9z.onrender.com/api/health/` → 200
   (`SELECT 1` succeeds), then log in and spot-check recent recipes / menus.
5. Once confirmed, delete the old broken instance and — if you diverged from
   the blueprint — reconcile `render.yaml` so a future Blueprint sync doesn't
   repoint the app at the dead database.

## 4. Restore from a `pg_dump` file

Into a fresh Render database (create one, Basic plan, same region), or a new
local Postgres for inspection:

```bash
# custom-format (.dump)
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "$TARGET_DB_URL" cookbook-YYYYMMDD-HHMM.dump

# plain SQL (.sql)
psql "$TARGET_DB_URL" -f cookbook-YYYYMMDD-HHMM.sql
```

Then the same cut-over + verify as §3 steps 3–5. After a full restore run
`python manage.py migrate` (no-op if the dump was current) and
`python manage.py sync_capabilities` on `cookbook-api`.

## 5. Known gaps / TODO

- **No PITR** — accepted for now. Revisit (plan upgrade) if the data becomes
  business-critical enough that a lost day hurts.
- **`ipAllowList` is `0.0.0.0/0`** — the DB accepts connections from any IP.
  Fine for solo dev + occasional `pg_dump`; tighten to Render's egress range
  + known office IPs before this has real customer data. Tracked in
  `HARDENING.md`.
- **Restore has never been rehearsed.** Do a throwaway §3 restore once so the
  cut-over steps are known-good, then delete the practice instance.
