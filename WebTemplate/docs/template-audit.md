# Template Audit — Intellect AI Dashboard → Spico

Date: 2026-07-23
Status: Pre-implementation audit. No application code has been created yet.

## 1. What is actually in `WebTemplate`

`WebTemplate/intellect-ai-dashboard-template/` contains **11 unopened zip archives**, not a
scaffolded application:

```
Intellectai-AI-HTML_v1.0.0.zip      static HTML/SCSS (design source, light + dark)
Intellect_AI_React_v1.0.0.zip       React 18 + TypeScript (Create React App)
Intellectai_Vue_v1.0.0.zip          Vue
INTELLECTAI-angular.zip             Angular
intellectai-django.zip              Django
Intellect_AI_Laravel_v1.0.0.zip     Laravel
Intellect_AI_PHP_v1.0.0.zip         Plain PHP
Intellect_AI_CakePHP_v1.0.0.zip     CakePHP
Intellect_AI_CI_v1.0.0.zip          CodeIgniter
Intellect_AI_Symfony_v1.0.0.zip     Symfony
Intellect_AI_ASP_v1.0.0.zip         ASP.NET
Intellect_AI_YII_v1.0.0.zip         Yii
```

This is a commercial "AI content generator" admin dashboard template (marketed under the
in-app title **"Openup AI Generator Dashboard"**), sold with the same visual design
re-implemented across many backend stacks. **None of these variants is Next.js.** Nothing
in the bundle has been extracted or wired up — there is no live app yet.

Only the **HTML** and **React** variants were inspected in depth, since they are the only
ones relevant to a TypeScript/Next.js direction. The other 9 stacks (Vue, Angular, Django,
Laravel, PHP, CakePHP, CodeIgniter, Symfony, ASP.NET, Yii) are the same design in other
languages and are **not used** for Spico.

## 2. Current stack and framework (React variant)

- **Bootstrapped with Create React App** (`react-scripts": "5.0.1"`) — CRA has been
  deprecated/unmaintained upstream since Feb 2025.
- React 18.3, TypeScript 4.4 (non-strict `tsconfig`).
- Routing: `react-router-dom` v6, client-side only (`BrowserRouter`).
- State: `@reduxjs/toolkit` + `react-redux` — used **only** for a light/dark theme toggle
  and a sidebar-collapsed flag. No app data lives in Redux.
- UI kit: Bootstrap 5 + `react-bootstrap` (`Container/Row/Col`, `Tab`, `Collapse`, etc.).
- Styling: hand-written SCSS on top of Bootstrap (see §5).
- No backend of any kind: no `axios`/`fetch`/`supabase` calls anywhere in `src`. All data
  in every page is hardcoded JSX/mock content (fake avatars, fake chat transcripts, fake
  FAQ copy).
- No authentication logic: `Login.tsx`, `Register.tsx`, `ResetPassword.tsx` are static
  markup (`<form action="#" method="post">`) with no submit handlers, no validation, no
  session state.
- No tests beyond the CRA-generated placeholder (`App.test.tsx`).

## 3. Existing folder structure (React/Admin)

```
Admin/
  public/                index.html, favicon, manifest
  src/
    App.tsx              mounts <Routing/>, imports style.scss
    Routes/
      routes.tsx          route table (path -> element)
      index.tsx            BrowserRouter + layout wrapping (ThemeLayout vs NonLayout)
    ThemeLayout/
      index.tsx            authenticated app shell (sidebar + topbar + content)
      NonLayout.tsx         bare shell for auth pages
      LeftSidebar.tsx       collapsible nested nav
      TopBar.tsx            search, theme toggle, notifications, user menu, subscription modal
      menu.ts               nav data (flat array, one level of subMenu)
    Pages/
      Home/                 marketing-style dashboard landing (banner + feature cards)
      Chatbot/               chat UI (message list, right sidebar, composer)
      ImageGenerator/        prompt form + right sidebar
      VoiceGenerator/        prompt form + right sidebar
      CommunityFeed/          social feed + image tabs
      CommunityDetails/       single feed item detail
      ManageSubscription/     pricing tiers + FAQ accordion (Bootstrap Tab)
      Settings/Faq.tsx        FAQ accordion
      Auth/                   Login, Register, ResetPassword (static forms)
    Common/                  ManageSubscription modal, sidebar-toggle hook
    Slices/theme/            redux slice + store (theme mode, sidebar toggle only)
    assets/
      scss/                  default/ (tokens, mixins, typography, forms, animations)
                             elements/ (per-component: chatbot, header, footer, modal, ...)
      images/                avatars, banners, generator thumbnails, per-page icons
      fonts/                 Font Awesome 6 Pro — brands/duotone/light/regular/solid/thin (ttf+woff2)
```

## 4. Existing routes/pages

Authenticated (wrapped in `ThemeLayout`, sidebar+topbar):

| Path | Page | Notes |
|---|---|---|
| `/` | Home | Marketing-style landing/dashboard, no real KPIs or charts |
| `/community-feed` | CommunityFeed | Social feed grid, not hospitality-relevant |
| `/community-details` | CommunityDetails | Single feed post detail |
| `/manage-subscription` | ManageSubscription | Pricing tiers + FAQ accordion — reusable for billing/plan UI |
| `/chatbot` | Chatbot | Conversation UI: message bubbles, avatars, composer, right sidebar |
| `/image-generator` | ImageGenerator | Prompt input + result grid — not hospitality-relevant |
| `/voicegenerator` | VoiceGenerator | Prompt input for audio — not hospitality-relevant |
| `/faq` | Faq | Accordion component |

Non-authenticated (wrapped in `NonLayout`, bare shell):

| Path | Page |
|---|---|
| `/login` | Login |
| `/register` | Register |
| `/reset-password` | ResetPassword |

The HTML variant additionally has a `profile.html` page not present in the React port —
worth extracting from the HTML zip if a profile-page layout is wanted later.

**There is no dashboard/table/chart/data-grid page anywhere in the bundle.** This template
is a content-generation marketing dashboard, not an operations/admin data dashboard. Every
KPI card, data table, calendar, chart, and detail view Spico needs (reservations, PMS,
analytics, agents, automations, integrations, team/roles, platform admin) must be built
from scratch — the template does not contain analogues for these.

## 5. Existing design tokens and visual system

Defined in `src/assets/scss/default/_variables.scss` as CSS custom properties:

```
--color-primary:    #3F3EED   (indigo/violet)
--color-primary-2:  #33B89F   (teal)
--color-secondary:  #1F1F25   (near-black)
--color-body:       #497696
--color-heading-1:  #083A5E
--color-success/danger/warning/info: standard semantic set
--font-primary / --font-secondary: 'Space Grotesk', sans-serif
--font-three: "Font Awesome 6 pro"
Type scale: --h1 60px ... --h6 18px; body sizes 16px/22px
```

Dark mode is a separate stylesheet (`_dark-version.scss`) toggled via a `body` class driven
by the Redux theme slice, not a CSS-variable re-theme — i.e. dark mode is implemented as
parallel override rules, which is workable but should be normalized when new
Spico-specific components are added.

Breakpoints are SCSS variables (`$sm-layout`, `$md-layout`, `$lg-layout`, ...), not Tailwind
conventions.

## 6. Existing assets and fonts

- **Font Awesome 6 Pro**, full family (brands, duotone, light, regular, solid, thin) as
  both `.ttf` and `.woff2`, plus per-page PNG/SVG icon sets under `assets/images/icons/`.
- **Space Grotesk** referenced as the type family (files not bundled in the zip — assumed
  loaded via a CDN `<link>` in the HTML variant's `<head>`; must be sourced/self-hosted for
  Spico, see `assumptions.md`).
- Stock avatar, banner, and "generator" thumbnail imagery — placeholder-only, not usable
  for a real product and not hospitality-relevant. Do not carry these into Spico beyond
  local dev placeholders.
- `fontawesome-6.css` and per-element SCSS partials for every visual pattern in the kit
  (buttons, modal, tooltip, forms, nice-select, audio player, lightbox).

## 7. Existing dependencies (React/Admin `package.json`)

```json
"@reduxjs/toolkit": "^2.2.6",
"react": "^18.3.1", "react-dom": "^18.3.1",
"react-router-dom": "^6.24.0",
"react-redux": "^9.1.2", "redux": "^5.0.1",
"bootstrap": "5.0.2", "react-bootstrap": "^2.10.4",
"sass": "^1.77.6",
"typescript": "^4.4.2",
"react-scripts": "5.0.1"
```

No form library (no react-hook-form/formik), no schema validation (no Zod/Yup), no data
fetching library, no chart library, no date library, no icon React-wrapper (icons are used
as raw `<i class="fa-...">`/image tags). All of this needs to be added for Spico.

## 8. Build and run commands (as shipped, CRA)

```
yarn / npm install
yarn start   → react-scripts start   (dev server, localhost:3000)
yarn build   → react-scripts build   (static SPA bundle)
yarn test    → react-scripts test
yarn eject   → one-way eject from CRA
```

These commands describe the **template as purchased**, not the Spico target. Per the
approved direction (see `architecture.md`), Spico will be scaffolded as a new Next.js App
Router project; CRA's own scripts are not carried forward.

## 9. Risks before modifying the template

1. **CRA is not a viable long-term foundation.** No SSR, no API routes, no middleware, no
   built-in image optimization, unmaintained tooling. Confirmed with you: rebuilding on
   Next.js App Router rather than extending the CRA app.
2. **No backend/auth exists anywhere in the bundle.** Every "login", "subscription", and
   data view is static mock markup. There is nothing to "migrate" data-wise — this is a
   pure visual/UX asset, not a working system.
3. **Design system is Bootstrap+SCSS, not Tailwind.** Confirmed with you: keep Bootstrap +
   SCSS as the visual foundation rather than converting to Tailwind, to preserve the
   purchased design and minimize visual-regression risk. This deviates from the generic
   "use Tailwind" technical direction — noted and accepted.
4. **No hospitality-domain pages exist.** Reservations, PMS, booking engine, guests,
   knowledge base, AI agent config, automations, calls, integrations, team/roles, platform
   admin, and any real analytics/charts must all be designed and built new. Only the app
   shell (sidebar/topbar/layout), auth page shells, chat UI, accordion/FAQ, and
   subscription/pricing UI are directly reusable.
5. **Irrelevant demo content** (Community Feed/Details, Image Generator, Voice Generator,
   generic "AI content" marketing copy) should be removed/repurposed rather than preserved,
   since it actively misrepresents the product and is not part of the Spico domain. This is
   a deletion of unused demo scaffolding, not of anything functional — flagging per your
   instruction not to delete without confirmation; recommend removing in the same milestone
   these pages would otherwise need porting, rather than porting dead demo pages first and
   deleting later.
6. **Font licensing**: Font Awesome 6 Pro files are bundled in the zip under whatever
   license the template purchase grants — confirm this license permits use in the
   commercial Spico product before shipping the font files as-is.
7. **`__MACOSX` folder** at `WebTemplate/__MACOSX/` is a macOS zip-extraction artifact
   (resource-fork metadata for the already-unopened archives), not project content. Safe to
   delete once you confirm — left untouched for now.

## 10. Recommended migration strategy

1. Scaffold a new Next.js 14+ App Router project inside `WebTemplate/` (TypeScript strict,
   ESLint) — this becomes the one live application; the zip bundle remains as a reference
   asset library only.
2. Extract from the **React** zip: SCSS token/element partials, Font Awesome files, and the
   layout components (`ThemeLayout`, `LeftSidebar`, `TopBar`) — port these to App Router
   conventions (`app/(dashboard)/layout.tsx`, client components where interactivity is
   needed, server components elsewhere).
3. Port **Login/Register/ResetPassword** page markup, wire to real Supabase Auth instead of
   the static `<form action="#">`.
4. Port the **Chatbot** conversation UI as the visual base for the future Inbox feature
   (not built yet — foundation milestone only).
5. Port **ManageSubscription**'s accordion/pricing UI as the visual base for future
   plan/billing UI.
6. Drop Community Feed/Details, Image Generator, and Voice Generator pages — not
   hospitality-relevant; confirm with you before deleting the source pages, but do not port
   them forward into the Next.js app.
7. Re-theme the nav (`menu.ts`) around Spico's actual module list (Dashboard, Inbox, Calls,
   AI Agents, Automations, Reservations, PMS, Booking Engine, Guests, Knowledge Base,
   Analytics, Team & Roles, Integrations, Settings, Platform Admin) instead of the generic
   content-generator nav.
8. Everything else (multi-tenant data model, RBAC, RLS, audit log, real dashboards) is new
   work layered on top of the ported shell — see `roadmap.md` for sequencing.
