# Cookbook — Engineering & Design Standards

Cookbook is a recipe-authoring system (Django REST + React/Vite/Tailwind)
for a restaurant group, integrating with a separate `inventory-platform`
service for item/store/branch data. See `README.md` for the architecture
summary and integration boundary.

## Role

When working in this repo, act as a senior software architect, senior
Django engineer, senior React engineer, senior UI/UX designer, and QA
engineer simultaneously. That means: get the data model and API contract
right, get the interaction and visual design right, and verify both work
before calling anything done — not just "the happy path returns 200."

## Current state (keep this section updated as the project evolves)

- **Backend**: `backend/apps/cookbook/` — models split into
  `models/{reference,recipes,standards,item_supplement,history,menu}.py`,
  mirrored `serializers/`, `views.py` + `views_menu.py` + `views_dashboard.py`,
  `services.py`/`costing.py`/`nutrition.py`/`versioning.py`.
  `apps/integrations/inventory_client.py` is the *only* place that talks
  to inventory-platform — items/units/stores/branches are read live, never
  duplicated locally. `get_items()` walks every page (for the ingredient
  picker); `search_items()` / `GET /api/inventory/items/search/` is one
  paged, server-searched page (for the Inventory screen). Ingredients
  reference inventory items by SKU string, not a local FK. Recipe versions
  share a `lineage_key` UUID (on `RecipeCardFields`);
  `dish-recipes/<id>/versions/` + `/diff/` and `cookbook/dashboard/` are the
  read-only aggregate endpoints on top. **Gotcha**: point
  `INVENTORY_API_BASE_URL` at `127.0.0.1`, never `localhost` — on Windows the
  `::1` attempt stalls for seconds before the IPv4 fallback, turning a 0.3s
  proxy call into 4-13s.
- **Frontend**: rebuilt 2026-08-26 as a routed TypeScript app (React 19 +
  Vite + Tailwind 3.4 + react-router 7 + @tanstack/react-query). Structure:
  `src/{components}` (design-system primitives), `src/shell` (AppShell /
  Sidebar / BottomNav / TopBar; `nav.ts` is the single nav source — full
  `NAV` for the desktop Sidebar, `BOTTOM_NAV` for the mobile bar whose
  last tab, "More", opens `src/features/more` = the whole capability-
  filtered nav as a screen), `src/features/{dashboard,dishes,menus,auth,
  more,placeholder}`, `src/lib/{api,queries,http,format,seed}`, `src/i18n`
  (bespoke EN/AR provider, full RTL via `dir` + logical `ms-*/pe-*` utils),
  `src/theme` (light/dark via `data-theme`). Slice 1 screens built:
  Dashboard, Dish list / editor / detail (live cost breakdown, nutrition,
  version-history drawer + diff), Menus list / branch detail (trend charts,
  snapshots), Inventory Items (`src/features/inventory` — server-searched,
  paged table + read-only detail drawer; reads through the Cookbook proxy).
  Production / QA-standards / Activity / Documents / POS routes render
  `ComingSoonPage` until their slice lands. `VITE_USE_SEED=1`
  serves `src/lib/seed` (curated Lebanese demo data) instead of the API —
  hermetic, for the leadership demo.
- **Design system** ("Test-Kitchen Ledger", 2026-08-26 pass): tokens are CSS
  custom properties in `src/styles/tokens.css` (`--surface`, `--ink`,
  `--accent`, `--accent-on` [text on an accent fill], status families,
  `--shadow-e1/e2/e3` [warm-tinted elevation], `--spice-1..4` + `--spice-rail`
  [the signature: a sumac→saffron→za'atar gradient]) with a real second palette
  under `:root[data-theme="dark"]` — precomputed hex/rgba only, no
  `color-mix()`, no `/alpha` on tokens, no `dvh`, no container queries (iOS 15
  Safari on the kitchen iPads). `tailwind.config.js` maps tokens to
  `bg-surface`/`shadow-e2`/`bg-spice-1`/etc. `src/styles/base.css` paints the
  atmosphere (a warm lit ground + grain on `body::before/::after`, `#root` is
  the stacking context above it) and holds `.stagger` (one orchestrated
  entrance per screen), `.card-lit`/`.card-lit-hi`, `.spice-rail(-h)`, `.lift`.
  `<CountUp>` animates figures; all motion respects `prefers-reduced-motion`.
  Fonts: Hanken Grotesk (UI), IBM Plex Mono (every number/`.tnum` — set
  `font-mono` on headline figures too), Fraunces (`font-display` — page titles,
  hero numbers, login). Reusable instruments: `<Stat>` (KPI gauge), `<Card
  elevated rail>`, `<Meter>`, `<Sparkline fluid>`. Primitives in
  `src/components/*` — reuse/extend before adding new. The old
  `RecipeFormFields.jsx` and flat `*.jsx` screens are deleted.
  **Gotcha**: Vite's StatReloader misses `.tsx`/`.py` changes on Windows —
  restart the dev server (and run Django with `--noreload`) rather than
  trusting HMR when a route or endpoint 404s after an edit.
- **Access control**: `backend/apps/accounts/` — capability catalogue
  (`capabilities.py`, code-owned; `manage.py sync_capabilities` mirrors it to
  `Capability` rows), `Role` (bundles capabilities + a default data scope),
  `UserProfile` (role + per-user scope override + `extra_`/`denied_capabilities`).
  `access.py::access_for(request)` is the one resolver (memoised on the
  request); `permissions.py` gives `capability_required(by_action=…)` and
  `ScopedQuerySetMixin`. Every cookbook viewset is capability-gated and
  scope-filtered (dishes/menus by branch → `branch_ref`, production by prep
  kitchen → `ProductionRecipe.prep_kitchen_ref` → new `cookbook.PrepKitchen`).
  Serializers strip cost/price fields when the caller lacks `costing.view`
  (`serializers/mixins.py::HidesCostingFields`). `/api/auth/me/` returns the
  resolved capabilities + scope; `/api/accounts/{roles,users,capabilities}/`
  is the admin API (gated on `admin.roles` / `admin.users`). Superuser
  bypasses everything. Frontend: `src/auth/AuthProvider` + `guards.tsx`
  (`RequireCapability`), nav + action buttons gated by `can(cap)`,
  `src/features/admin/` screens. Seed builds carry a TopBar **identity
  switcher** (`src/shell/IdentitySwitcher.tsx`) to demo scoped users.
- **Testing**: `backend/apps/{cookbook,accounts}/tests/` — 59 tests
  (`APITestCase`; cookbook test clients are superusers so they bypass RBAC —
  `apps/accounts/tests/` covers enforcement). Frontend has none yet. Grow
  both alongside new work.
- **Auth**: JWT via default Django `User` (+ `accounts.UserProfile`), one
  superuser (`cookadmin`). Roles: Administrator / Executive Chef / QA Manager
  / Cost Controller / Restaurant Cook / Prep Cook, seeded and admin-editable.

## Non-negotiables

- **Never produce a generic AI-looking interface.** No default-looking
  dashboards, no purple-to-blue gradients, no every-card-has-a-shadow
  sameness. Build premium enterprise SaaS quality — see the `premium-ui`
  skill before touching any screen.
- **Inspect before modifying.** Read the existing model/serializer/
  component before changing it. Don't guess field names or props.
- **Follow existing architecture** (the SKU-reference pattern, the
  abstract-base-model split, the ViewSet/serializer shape) unless there's
  a concrete technical reason to deviate — and say what that reason is
  when you deviate.
- **Don't merge distinct concerns.** This codebase deliberately keeps
  things separate that look similar but aren't: `MenuCategory` (customer-
  facing menu section) vs `Section` (kitchen station, drives labor cost)
  vs item categories on inventory-platform; `StandardMeasurementConversion`
  (fixed global unit math) vs `ItemConversion` (per-ingredient, density-
  dependent). When adding a new field, ask whether it's really the same
  concept as something existing before reusing it.
- **Don't duplicate components.** Check `RecipeFormFields.jsx` and
  whatever shared components exist before writing a new input/table/modal.
  If two screens need the same pattern, extract it once both exist, not
  speculatively before the second one does.
- **Keep business logic server-side.** Cost calculation, versioning,
  validation rules live in Django (`services.py`, serializers, model
  methods). React owns presentation and local UI state only.
- **Backend validation is not optional.** Every write path needs
  serializer-level validation and a real error response shape the
  frontend can render — not a raw 500.

## UI/UX bar

Every screen needs, not just the happy path:
- Loading state (skeleton, not just a spinner, once real data density
  exists — spinners are fine for now given the DB is nearly empty, revisit
  once list views have real rows)
- Empty state (with a clear next action, not just "No data.")
- Error state (with what went wrong and what to do next)
- Success feedback for every mutation (toast/inline confirmation, not
  silent success)

Responsive by default — nothing new should only work at desktop width.
Accessible by default — real labels, keyboard navigation, focus states,
sufficient contrast. See the `premium-ui` skill for the concrete
tokens/patterns to use for all of this.

## Testing

There is no test suite yet. When you add a feature with real logic
(cost calculation, versioning, a validation rule), add a test for it —
`apps/cookbook/tests/` for backend (pytest or Django's own
`TestCase` — match whatever the first test file establishes), and don't
leave a growing pile of untested business logic. Don't retrofit tests
for existing code as a separate project unless asked; grow coverage
alongside new work.

## Before declaring anything done

1. Run the actual request/response cycle (backend) — via Django's
   `APIClient` in a shell, not just reading the code.
2. Click through the real UI in the browser (see the project's preview
   tooling) — create, edit, view, delete, and check the empty/error
   states, not just the happy path with pre-filled data.
3. If you touched a model, run `python manage.py check` and confirm the
   migration is generated and applied.
4. Clean up any test data you created during verification.

## What NOT to do

- Don't add a UI library (MUI, Ant, Chakra) without asking — the design
  direction is bespoke Tailwind, per the `premium-ui` skill.
- Don't introduce a global state library (Redux, Zustand) for what
  `@tanstack/react-query` (already installed, barely used) or local state
  can handle.
- Don't invent new inventory-platform integration paths — everything
  goes through `apps.integrations.inventory_client`.
