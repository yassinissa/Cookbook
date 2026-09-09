# ── Cookbook — Django REST API ───────────────────────────────────────────────
# Multi-stage: a builder installs wheels, the runtime image ships only what's
# needed to run gunicorn. Base pinned to the project's Python (runtime.txt).
#
# Build:   docker build -t cookbook-api ./backend
# Used by: ../docker-compose.yml  and  Coolify (point it at backend/Dockerfile)
#
# Render is unaffected — render.yaml pins `runtime: python`, which overrides
# Dockerfile auto-detection. See DEPLOY_SELFHOST.md.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# ── Stage 1: build the dependency tree ───────────────────────────────────────
FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements/ requirements/
RUN pip install --prefix=/install -r requirements/production.txt

# ── Stage 2: lean runtime image ──────────────────────────────────────────────
FROM base AS runtime
# libpq5 for psycopg2, curl for the container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /install /usr/local

COPY . .

# Non-root. staticfiles/ (collectstatic target) and media/ (uploads) must be
# writable — media/ is a mounted volume in real deployments.
RUN useradd --system --uid 1000 --shell /usr/sbin/nologin app \
    && mkdir -p /app/staticfiles /app/media \
    && chmod +x /app/entrypoint.sh \
    && chown -R app:app /app
USER app

ENV DJANGO_SETTINGS_MODULE=config.settings.production
EXPOSE 8000

# entrypoint: wait for DB → migrate → collectstatic → sync_capabilities → gunicorn
ENTRYPOINT ["/app/entrypoint.sh"]
