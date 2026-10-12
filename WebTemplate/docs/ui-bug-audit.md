# Spico — UI Bug Audit (Milestone 14)

Local launch, UI stabilization, and bug-fix sprint. Audit performed 2026-07-27 against
the running dev server at `http://localhost:3000` (project ref `cwcmjtglxyojsjzvunsf`,
real Supabase connection via `.env.local`).

## Audit method & coverage

- **Verified locally (unauthenticated):** root redirect, `/login`, `/register`,
  `/reset-password`, public booking `/book/[slug]` (incl. "Hotel not found" empty state),
  `/book/[slug]/confirmed`, protected-route redirect behavior (all `/o/**` and `/admin/**`
  return `307 → /login`), production `next build`, `tsc --noEmit`, `eslint .`.
- **Audited from source only (could not reach live — no local account password):** every
  authenticated dashboard/admin page. Findings below marked *(source)* were confirmed by
  reading the component/SCSS, not by driving the live screen.
- Not seeded: the connected hotel has no inventory yet, so PMS/booking availability and
  most list pages will show empty states even once logged in (expected).

## Severity legend
Critical / High / Medium / Low — per the milestone priority system.

---

### BUG-01 — Dev server stuck in a crashed worker state (every route 500)
- **Severity:** Critical
- **Area:** Local runtime / whole app
- **Repro:** A pre-existing `next dev` instance (PID 17572) was running; every route
  (`/book/test-hotel` first observed) returned HTTP 500 with
  `Jest worker encountered 2 child process exceptions, exceeding retry limit`.
- **Expected:** Routes render (or return a clean not-found), server stays healthy.
- **Actual:** Turbopack worker pool had crashed; all subsequent requests 500'd.
- **Root cause:** Stale/corrupted dev worker pool in the long-lived dev process (not a code
  defect — a clean restart resolves it). `.next/dev/lock` was also present.
- **Fix:** Killed the stale process, removed `.next/dev/lock`, restarted `next dev`. All
  routes recovered. (No code change.)
- **Status:** Fixed (infra)

### BUG-02 — Destructive actions had no confirmation
- **Severity:** Critical ("a destructive action without confirmation")
- **Area:** Team, Integrations (API keys / webhooks / connectors), Knowledge Base
  documents, PMS rate seasons, Agent knowledge sources, Business-hours holidays *(source)*
- **Repro:** Click **Revoke** / **Delete** / **Remove** — the server action fired
  immediately on a single click, no prompt.
- **Expected:** A confirmation gate before irreversible loss of access/data; button can't be
  double-submitted.
- **Actual:** Plain `<button type="submit">` in a server-action form → one misclick revokes a
  team member's access, deletes a webhook, revokes an API key, etc.
- **Root cause:** No confirmation pattern existed for inline single-button destructive forms
  (only the bulk Test-Data tool had a checkbox gate). `confirm()` was used nowhere.
- **Fix:** New reusable client component `components/ui/ConfirmSubmitButton.tsx` — native
  `confirm()` gate + `useFormStatus` pending-disable (prevents double submit). Applied to all
  7 `btn-danger` destructive buttons plus the holiday **Remove** button. Reuses existing
  `rts-btn`/`btn-danger` classes — no new styling.
- **Status:** Fixed

### BUG-03 — Top-bar "Profile" menu item linked to a non-existent route
- **Severity:** High (broken navigation in global chrome)
- **Area:** `components/layout/TopBar.tsx` → `/profile`
- **Repro:** Signed in → open avatar menu → **Profile** → 404 (no `app/(app)/profile` route
  existed).
- **Expected:** A working account page.
- **Actual:** Dead link for every authenticated user.
- **Root cause:** Route was never created; the link shipped anyway.
- **Fix:** Added `app/(app)/profile/page.tsx` — read-only account details (name, email,
  platform role) with sign-out and a home link. Truthful copy: account details are managed by
  an administrator (no fake edit form). Build confirms `/profile` now resolves.
- **Status:** Fixed

### BUG-04 — Sidebar "index" item stayed highlighted on every child route
- **Severity:** Medium (navigation clarity; High-ish because it affects every page)
- **Area:** `components/layout/LeftSidebar.tsx` (hotel, org, and platform sidebars) *(source)*
- **Repro:** Navigate to e.g. `…/h/<hotel>/inbox`. Both **Dashboard** (the section index,
  href = the hotel root) and **Inbox** show the active style. Same for org **Hotels**
  (`/o/<slug>`) and platform **Organizations** (`/admin`).
- **Expected:** Exactly one nav item active — the most specific match.
- **Actual:** Two items highlighted because active test was
  `pathname === href || pathname.startsWith(href + "/")`, and the index href is a prefix of
  every child.
- **Root cause:** Prefix match with no "longest match wins" tie-break.
- **Fix:** Compute the single best match across all items (longest matching href) and mark
  only that one active. Nested routes (e.g. agent detail under **AI Agents**) still light the
  correct parent.
- **Status:** Fixed

### BUG-05 — Wide tables overflowed horizontally on mobile
- **Severity:** Medium (responsive)
- **Area:** All `.spico-table` uses (Team, API keys, Reservations, Guests, Departments,
  webhook deliveries, rate seasons, …) *(source)*
- **Repro:** View a multi-column table (esp. Team, with inline role/department forms per row)
  at 320–480px.
- **Expected:** Table scrolls horizontally within its own box; the page itself does not
  scroll sideways and no columns are clipped.
- **Actual:** `.spico-table` had `width:100%` with no scroll container → wide content pushed
  the page into horizontal scroll / clipped cells.
- **Root cause:** No responsive wrapper for the shared table component.
- **Fix:** `@media (max-width: 767px)` makes `.spico-table` a scrollable block
  (`display:block; overflow-x:auto`). Desktop layout unchanged.
- **Status:** Fixed

### BUG-06 — App error boundary was a dead end and leaked raw error text
- **Severity:** Medium (usability / polish)
- **Area:** `app/(app)/error.tsx` *(source)*
- **Repro:** Any thrown error inside the app shell.
- **Expected:** Friendly message, a **Try again** (reset), and a way back.
- **Actual:** Rendered `{error.message}` as the body with no reset and no navigation.
- **Root cause:** Minimal placeholder boundary.
- **Fix:** Friendly copy, **Try again** (`reset()`) + **Back to home**, `console.error` for
  debugging, and the raw string replaced by a small `digest` reference for support.
- **Status:** Fixed

### BUG-07 — No global 404 page (unstyled Next default)
- **Severity:** Medium (polish)
- **Area:** App root *(source)*
- **Repro:** Hit a non-existent path (or a `notFound()` on a public route).
- **Expected:** Branded, styled 404 with a route home.
- **Actual:** Next.js's default bare 404.
- **Fix:** Added `app/not-found.tsx` — self-contained Spico-branded 404 (wordmark, 404, back
  home). (Note: authenticated non-existent paths still redirect to login via middleware
  before rendering; the page applies to public-group and post-auth `notFound()` cases.)
- **Status:** Fixed

### BUG-08 — Framework deprecation warnings (non-blocking)
- **Severity:** Low
- **Area:** Build/runtime logs
- **Details:**
  - `middleware.ts` triggers Next 16's "middleware is deprecated, use `proxy`" warning.
    Still fully functional; renaming is a mechanical future task, deferred to avoid touching
    the auth gate during a UI sprint.
  - Dart Sass `@import` and global-function (`nth`, `map-get`) deprecation warnings flood the
    dev log from the ported template SCSS. Cosmetic; slated for the Sass module-system
    migration, not this milestone.
- **Status:** Deferred (documented)

---

## Observations noted but NOT changed (deferred, low-risk to leave)

- **Mobile navigation is an icon-only rail, not a labeled drawer.** On `$sm-layout` the
  ported sidebar hides (`translateX(-100%)`) and the top-bar toggle reveals a ~64px icon rail
  (labels hidden); there is no dimmed backdrop (`.overlay-mobile-area` is unstyled). Nav is
  reachable but not ideal on phones. Changing it means reworking the ported template's sidebar
  behavior — out of scope for a stabilization pass; flagged for a dedicated responsive-nav
  task.
- **Non-destructive dashboard forms don't show a pending state.** Only auth forms
  (`useActionState`) and now destructive buttons disable while submitting. Adding pending
  state to every "Save/Add" form is a broad change; deferred.
- **Header/dropdown SCSS uses hardcoded light colors** (`#fff`, `#f3f2f7`); dark mode is
  handled separately in `_dark-version.scss`. Left as-is (design-system territory).

## Build / typecheck / lint / runtime — Milestone 14
- `npx tsc --noEmit` — **clean**
- `npx eslint .` — **clean**
- `npx next build` — **success**, all routes compiled (incl. new `/profile`, `/not-found`)
- Dev server restarted clean; log free of ERROR/worker crashes after fixes.
