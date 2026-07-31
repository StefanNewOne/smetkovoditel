# Feature Plan — Responsive layout (SM-84)

**Status:** approved · **Date:** 2026-07-20 · **Type:** Modification (UI only)
**Design note (Category 13):** the handoff is desktop-only; responsive breakpoints are not in it.
Developer explicitly requested full responsiveness — this is the sign-off for the deviation.

The app shell forces `min-w-[1180px]` and uses no breakpoints anywhere, so every screen overflows a
smaller viewport with a page-wide horizontal scrollbar. Fix in three levels, low-risk first.

## Root cause

- `(app)/layout.tsx` — `min-w-[1180px]` on the shell + `flex flex-1` without `min-w-0`.
- No `sm:/md:/lg:` breakpoints anywhere (except the mobile W6 screen, which is the style reference).
- Content 2-col grids, table grids, and modals all use fixed inline widths.

## Level A — stop the overflow (minimal, classes only)

1. `(app)/layout.tsx` — drop `min-w-[1180px]`; add `min-w-0` on the content column; `main` padding
   `p-4 md:p-6 lg:p-7`.
2. Table grids wrapped in `overflow-x-auto` with a `min-w-[…]` so they scroll instead of squishing:
   `charges-view.tsx`, `clients/page.tsx`, `cash-view.tsx`.
3. Modals: `w-[Npx]` → `w-full max-w-[Npx]`, inner `max-h-[90vh] overflow-y-auto`:
   `charges-view`, `cash-view`, `contractors-view` (×2), `settings-view`, `new-client-wizard`.

## Level B — stacking (real responsiveness)

4. Replace inline `gridTemplateColumns` with responsive Tailwind classes (stack under `lg`):
   `import-view`, `resolve-view`, `settings-view`, `reports/page`, `contractors-view`,
   `clients/[id]/page`.
5. `header.tsx` — `px-4 md:px-7`, `<h1 truncate>`, hide the Gmail pill under `sm`.

## Level C — mobile sidebar

6. `sidebar.tsx` — `hidden md:flex`; add an off-canvas drawer + hamburger in `header.tsx` (client
   state, `fixed inset-0 md:hidden` overlay).
7. Optional: tables → card layout under `md` (instead of horizontal scroll from Level A).

## Cross-cutting

8. `app/layout.tsx` (root) — add `export const viewport = { width: "device-width", initialScale: 1 }`.
9. Breakpoints: content 2-col stacks under `lg` (1024); sidebar drawer under `md` (768); tables
   scroll/stack under `md`. Tailwind defaults (sm 640 / md 768 / lg 1024).

## Test

- 375 / 768 / 1280 px via DevTools; assert no page-wide horizontal scroll
  (`documentElement.scrollWidth <= clientWidth`); every modal fits 375px; every table scrolls/stacks.
- Build + typecheck (class-only changes, no logic).
