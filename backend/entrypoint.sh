#!/bin/sh
# Cookbook API container entrypoint.
# Runs the same startup steps render.yaml's buildCommand/startCommand do, in
# order, every boot. Safe to re-run: migrate / collectstatic / sync_capabilities
# are all idempotent.
set -e

: "${DB_HOST:=db}"
: "${DB_PORT:=5432}"

echo "→ waiting for postgres at ${DB_HOST}:${DB_PORT} ..."
python - <<'PY'
import os, socket, sys, time
host, port = os.environ.get("DB_HOST", "db"), int(os.environ.get("DB_PORT", "5432"))
for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            print("  postgres is up")
            sys.exit(0)
    except OSError:
        time.sleep(1)
print("  postgres did not come up in 60s", file=sys.stderr)
sys.exit(1)
PY

echo "→ migrate"
python manage.py migrate --noinput

echo "→ collectstatic"
python manage.py collectstatic --noinput

echo "→ sync_capabilities"
python manage.py sync_capabilities

echo "→ gunicorn"
# One gthread worker keeps the public-menu LocMem cache coherent and rides out
# inventory-platform's cold start (see render.yaml). Bump --workers + move the
# cache to Redis/DB only when one process can't keep up.
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-1}" \
    --threads "${GUNICORN_THREADS:-8}" \
    --worker-class gthread \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
