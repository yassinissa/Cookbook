# Accessibility audit — frontend

First pass, 2026-09-08. **Static** review of the design-system primitives + app
shell against the Web Interface Guidelines / WCAG 2.2 A/AA. A live automated
scan (axe / accesslint) and a hands-on screen-reader + keyboard pass are the
natural follow-ups — see §3.

Legend: ☑ fixed in pass 1 (PR #21) · ☐ open

---

## 1. Fixed in pass 1

- ☑ **No skip link.** Keyboard users tabbed through the whole sidebar on every
  page. Added a `.skip-link` first tab-stop → `#main-content` (`AppShell`,
  `base.css`).
- ☑ **Unlabelled `nav` landmarks.** Sidebar + BottomNav are both `<nav>` with
  no name. Added `aria-label` (`a11y.mainNav` / `a11y.bottomNav`).
- ☑ **`<Button>` defaulted to `type="submit"`.** A bare `<button>` in a `<form>`
  submits — every real submit button already sets `type="submit"`, so ghost /
  icon buttons in forms were a latent stray-submit. Now defaults to `"button"`;
  also sets `aria-busy` while `loading`.
- ☑ **`<Combobox>` hardcoded `id="combobox-list"`.** Two on one page (the
  ingredient editor renders many) → duplicate ids, broken `aria-controls`.
  Now `useId()`, and the input gets `aria-activedescendant` + `aria-autocomplete`.
- ☑ **`<Drawer>` had no accessible name when `title` was a node** (only a
  string title worked). Now `aria-labelledby` → the `<h2>`. Added
  `overscroll-contain` to the scroll area.
- ☑ **`<ConfirmDialog>` was a weak modal**: no accessible name/description, no
  focus trap, no focus restore on close. Added `aria-labelledby` /
  `aria-describedby`, `trapTab` (shared `lib/a11y.ts`, extracted from Drawer),
  and return-focus-to-trigger.
- ☑ **`<Field>` required marker.** The `*` was visual-only — the control never
  got `aria-required`. Now forwarded; the `*` is `aria-hidden`. Error text got
  `role="alert"` so it announces on appearance.
- ☑ **No `touch-action: manipulation`** on interactive elements (300 ms
  double-tap-zoom delay on the kitchen tablets) + tap-highlight flash. Added
  globally in `base.css`.
- ☑ **BottomNav** now pads `env(safe-area-inset-bottom)` (home-indicator area).

## 2. Open — need a focused change or a decision

- ☐ **TopBar user menu + identity switcher: `role="menu"` with no keyboard.**
  Items use `onMouseDown`+`preventDefault` (mouse-only — Enter/Space fire
  `click`, which nothing handles), no arrow keys, no Escape, no focus move into
  the menu. `role="menu"` without APG keyboard semantics is worse than a plain
  disclosure. Fix: either a shared `<Menu>` primitive with the APG pattern, or
  downgrade to a disclosure (`onClick` buttons, Escape, focus-visible).
- ☐ **TopBar search is not a real combobox.** Plain `<input>` + a `<ul>` of
  `<button onMouseDown>` — no arrow-key navigation into results, no
  `role="combobox"`/`listbox`, no `aria-expanded`. Keyboard users can't reach
  the results. `src/components/Combobox.tsx` already does this correctly — reuse
  its shape.
- ☐ **Modals don't `inert` the background.** `aria-modal="true"` helps some
  screen readers but not all; `Drawer` + `ConfirmDialog` should mark the app
  root `inert` (or `aria-hidden`) while open so AT can't wander behind them.
- ☐ **"Focus first error on submit" not verified.** `<Field>` wires
  `aria-describedby`/`role="alert"`, but the forms
  (`DishEditorPage`, `ProductionEditorPage`, `StandardEditorPage`,
  `PlatingEditorPage`, `ItemSupplementPanels`, `LoginPage`) were not audited for
  moving focus to the first invalid field on a failed submit. Walk each.
- ☐ **`Drawer` / `ConfirmDialog` full-screen overlay `<button>`.** A 100%-viewport
  "Close"/"Cancel" button is an odd tab stop with an enormous invisible focus
  ring, and it duplicates the header close. Consider a non-focusable overlay +
  the explicit close control only.
- ☐ **Toast**: errors use `aria-live="polite"` (not `assertive`/`role="alert"`);
  4 s auto-dismiss has mouse-hover pause but no keyboard pause (WCAG 2.2.1).
  Long messages need `break-words`.
- ☐ **`theme-color`** is the fixed brand accent `#a8681c` and doesn't adapt to
  dark mode. Design decision — if kept, add a `prefers-color-scheme: dark`
  variant.
- ☐ **Native `<select>` options** don't set explicit `background-color`/`color`
  — Windows dark mode can render the dropdown list white-on-white. (Cookbook
  runs on iPads, so low priority.)

## 3. Not done this pass — needs tooling / a person

- **Live automated scan** — run `accessibility-scan` (axe/accesslint over CDP)
  against the app in seed mode (`VITE_USE_SEED=1`, bypasses auth) across the
  key routes: dashboard, dish list / editor / detail, production, standards,
  plating editor, menus, inventory, activity, the public menu `/m/:slug`,
  login. Catches contrast, name/role/value, ARIA misuse the static pass missed.
- **Colour contrast** — the "Test-Kitchen Ledger" palette (`tokens.css`) wasn't
  checked pair-by-pair for 4.5:1 (text) / 3:1 (UI). `--ink-subtle` on
  `--surface-sunken`, the "Soon" badge, and `text-white/85` on the DishImage
  gradient are the suspects.
- **Screen-reader pass** (VoiceOver / NVDA) — reading order, the version-history
  drawer, the diff view, the plating pin editor (drag interaction needs a
  keyboard alternative — WCAG 2.5.1), `<CountUp>` announcing changing numbers.
- **Reflow / 200 % zoom** (WCAG 1.4.10) on the data-dense tables and the
  costing breakdown.
