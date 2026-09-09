# ── Cookbook — React / Vite frontend ─────────────────────────────────────────
# Multi-stage: node builds the static bundle, nginx serves it.
#
# VITE_API_BASE_URL is baked into the bundle at BUILD time — it must be passed
# as a build arg, not a runtime env var:
#   docker build --build-arg VITE_API_BASE_URL=https://cookbook.example.com/api ./frontend
# In Coolify / docker-compose it's wired through as a build arg (see compose).
#
# Render is unaffected — render.yaml pins `runtime: static`. See DEPLOY_SELFHOST.md.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ── serve ────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/cookbook.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
