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
  `models/{reference,recipes,standards,item_supplement,history}.py`,
  mirrored `serializers/`, one `views.py`, `services.py` for live costing.
  `apps/integrations/inventory_client.py` is the *only* place that talks
  to inventory-platform — items/units/stores/branches are read live, never
  duplicated locally. Ingredients reference inventory items by SKU string,
  not a local FK.
- **Frontend**: flat `frontend/src/*.jsx`, no folder structure yet, no
  routing despite `react-router-dom` being installed (view switching is
  manual React state in `App.jsx`/`RecipesPage.jsx`). Two parallel CRUD
  flows (Dish/Production recipes: List/Form/Card) plus Items and Login.
- **Design system**: none yet. Tailwind config is stock (no custom
  tokens). The only shared UI pieces are recipe-specific
  (`RecipeFormFields.jsx`). This is the biggest gap — see the
  `premium-ui` skill for how to close it.
- **Testing**: none exists. Do not let this stay true as features grow —
  see Testing section below.
- **Auth**: JWT via default Django `User`, one superuser, no roles yet.

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
