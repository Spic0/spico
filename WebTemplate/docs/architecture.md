# Spico — Target Architecture

Status: proposed foundation, not yet implemented. See `roadmap.md` for what ships in
Milestone 1 vs later.

## 1. High-level shape

```
                        ┌────────────────────────┐
                        │        Vercel           │
                        │  Next.js App Router app │
                        │  (Web + API routes)     │
                        └───────────┬─────────────┘
                                    │ Supabase JS (SSR + browser)
                                    ▼
                        ┌────────────────────────┐
                        │        Supabase         │
                        │  Postgres + RLS          │
                        │  Auth                    │
                        │  Storage                 │
                        │  Realtime                │
                        │  pgvector (KB/RAG)       │
                        └───────────┬─────────────┘
                                    │ service-role, server-side only
                                    ▼
                 ┌───────────────────────────────────┐
                 │  Node.js persistent service (later)│
                 │  Telnyx webhooks, OpenAI Realtime,  │
                 │  WebSockets, queues/workers          │
                 └───────────────┬───────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │ Redis / Upstash (later)│
                     │ rate limit, queue,      │
                     │ retries, idempotency    │
                     └───────────────────────┘
```

The Next.js app on Vercel is the only thing built in this milestone. The Node.js voice/
webhook service and Redis/Upstash are explicitly **out of scope for now** per your
instructions — they're shown here only to make clear where today's boundaries sit so the
foundation doesn't box them out later (e.g. webhook signature-verification and idempotency
tables are modeled now, even though no webhook receiver exists yet).

## 2. Why Next.js App Router (not the template's CRA)

The template ships as Create React App: no server runtime, no API routes, no middleware,
no SSR. Every mandatory engineering rule in your brief — secrets never on the client,
server-side authorization on every mutation, Zod-validated inputs, RLS-backed tenant
isolation, webhook signature verification — assumes a request lifecycle Next.js provides
(Route Handlers, Server Actions, Middleware) and CRA does not. Rebuilding on App Router
also gets Vercel deployment, edge/node middleware for auth gating, and a natural home for
the Supabase SSR client. See `template-audit.md` §9 for the full comparison and your
confirmed decision.

## 3. Multi-tenancy model

Two tenant levels, matching the brief:

- **Organization** — a hotel group / management company. Top of the tenant tree.
- **Hotel** — a property belonging to an organization. Most operational data (reservations,
  guests, PMS state, agent config, KB documents) hangs off `hotel_id`.

A user is never tenant-scoped directly. Instead, **membership** rows join a user to an
organization (and optionally a specific hotel) with a role. Platform-level roles (Platform
Moderator/Admin/Superadmin) are **not** organization members — they're marked via a
separate `platform_role` on the user/profile, since they operate across all tenants and
must never be satisfied by an org-scoped RLS policy. See `erd.md` and `rbac.md`.

Every tenant-owned table carries `organization_id` and/or `hotel_id` per the mandatory
rule, and every one of those tables gets an RLS policy scoped to "the caller has an active
membership granting access to this org/hotel," never an application-layer-only check.

## 4. Next.js project layout (as built through Milestone 3)

```
WebTemplate/
  app/
    layout.tsx                        -- imports styles/main.scss, sets <html data-theme>
    (auth)/
      layout.tsx                      -- bare shell, no sidebar/topbar
      actions.ts                      -- signInAction, signUpAction, resetPasswordAction
      login/page.tsx
      register/page.tsx
      reset-password/page.tsx
    (app)/
      layout.tsx                      -- requireUser(), ThemeProvider + TopBar
      page.tsx                        -- "/" org switcher/home
      error.tsx                       -- error boundary for the authenticated app
      forbidden/page.tsx
      organizations/new/{page.tsx,actions.ts}
      admin/                          -- Platform Admin/Superadmin/Moderator surface
        layout.tsx                    -- requirePlatformRole(), DashboardShell + PLATFORM_NAV_ITEMS
        page.tsx                      -- orgs list + suspend/reactivate
        actions.ts
        audit-log/page.tsx            -- platform-wide, read-only
      o/[orgSlug]/
        layout.tsx                    -- resolves org by slug, DashboardShell + orgNavItems()
        page.tsx                      -- hotels list
        hotels/new/{page.tsx,actions.ts}
        team/{page.tsx,actions.ts}    -- invite / change role / revoke
        settings/page.tsx
        audit-log/page.tsx            -- org-scoped
        h/[hotelSlug]/
          layout.tsx                  -- resolves hotel by slug, DashboardShell + hotelNavItems()
          page.tsx                    -- hotel dashboard: real counts, completion %, recent activity (M2)
          departments/{page.tsx,actions.ts}     -- M2: create/edit/activate/deactivate
          schedule/{page.tsx,actions.ts}        -- M2: weekly business hours + holidays
          settings/{page.tsx,actions.ts,HotelSettingsForm.tsx}  -- M2: full hotel profile form
          agents/                     -- M3: AI Agent Configuration Foundation
            page.tsx                  -- list
            new/{page.tsx,actions.ts} -- create (also seeds capabilities/handoff/policy/prompt v1)
            [agentId]/
              layout.tsx              -- resolves agent, TabNav across the 7 tabs below
              page.tsx, actions.ts    -- Overview: core fields + activate/deactivate/archive
              languages/{page.tsx,actions.ts}
              capabilities/{page.tsx,actions.ts}
              schedule/{page.tsx,actions.ts}      -- Schedule AND Handoff (one tab, two forms)
              policy/{page.tsx,actions.ts}        -- Approval Policy
              prompt/{page.tsx,actions.ts}        -- structured editor + version history + restore
              test/{page.tsx,actions.ts}          -- Test Playground (pure simulation)
          [module]/page.tsx           -- generic placeholder for the remaining not-yet-built modules
  middleware.ts                       -- session refresh + auth gating (root, not in app/)
  components/layout/
    ThemeProvider.tsx                 -- client context: dark/light + sidebar-collapsed
    TopBar.tsx / LeftSidebar.tsx / DashboardShell.tsx
    TabNav.tsx                        -- M3: generic in-page horizontal tab nav (reusable beyond agents)
  lib/
    env.ts                            -- Zod-validated environment config
    authz.ts                          -- getCurrentUser/requireUser/requirePlatformRole/requirePermission/hasPermission
    audit.ts                          -- writeAuditLog()
    data.ts                           -- org/hotel/agent lookup helpers (RLS-scoped)
    nav.ts                            -- module list + per-context nav item builders
    languages.ts                      -- M2: curated guest-language list for the settings picker
    agentCapabilities.ts              -- M3: the capability registry (definitions live in code, not a table)
    agentPromptPolicy.ts              -- M3: platform-protected prompt rules (never hotel-editable, never in DB)
    agentTestSimulation.ts            -- M3: pure function computing the Test Playground result
    slug.ts
    actions/sign-out.ts
    supabase/
      client.ts / server.ts / middleware.ts
      types.ts                        -- hand-written Database type (see docs/assumptions.md)
  styles/                             -- ported SCSS (default/ + elements/) + spico.scss additions
  supabase/config.toml                 -- scaffolded via `supabase init`, ready for `supabase link`
  supabase/migrations/                -- see erd.md/rbac.md; 24 migration files, unexecuted (no live project yet)
  docs/                                -- this folder
```

Differences from the originally proposed layout: `(platform)`/`(org)` were merged into a
single `(app)` route group (one shared auth guard, contexts differ by nested layout instead
of top-level route groups), and paths use `/o/[orgSlug]` / `/o/[orgSlug]/h/[hotelSlug]`
rather than `/[orgSlug]` directly, to keep the URL namespace unambiguous. Behavior is
otherwise as designed. The 10 still-not-built hotel modules (Inbox, Calls, Automations,
Reservations, PMS, Booking Engine, Guests, Knowledge Base, Analytics, Integrations) are
served by one generic `[module]/page.tsx` (data-driven from `lib/nav.ts`) rather than 10
near-identical placeholder files. AI Agents was pulled out of that placeholder list in M3,
the same way Departments/Business Hours/Settings were pulled out in M2.

**Known gap (M1, still open after M2):** Team & Roles — now including department
assignment — is org-scoped only (`/o/[orgSlug]/team`). A Hotel General Manager
(hotel-scoped membership, no org-wide membership) cannot currently reach it, even though
`rbac.md`'s matrix grants that role `team.view`/`team.manage` at hotel scope. A
hotel-scoped team page is a reasonable fast-follow, not built now — see `assumptions.md`.

## 5. Auth & session flow

- Supabase Auth (email/password to start; SSO/social deferred).
- `@supabase/ssr` cookie-based session, refreshed in root `middleware.ts`.
- `middleware.ts` reads the session, resolves the caller's memberships/platform role, and
  redirects unauthenticated or unauthorized requests before a route group's layout renders.
- Server Components/Route Handlers re-check authorization server-side even when middleware
  already gated the route — middleware is a UX/perf optimization, never the sole
  authorization boundary, per the mandatory rule that every mutation must have
  authorization.

## 6. Validation & typing

- `zod` schemas for: environment variables (`lib/env.ts`), every API route/Server Action
  input, and every form (paired with `react-hook-form` via `@hookform/resolvers/zod`).
- TypeScript `strict: true` from the start. No `any` — use `unknown` + Zod narrowing at
  system boundaries (external payloads, webhook bodies once those exist).

## 7. Provider adapter pattern (for later integrations)

Not implemented in Milestone 1, but the module boundary is reserved now:

```
lib/providers/
  voice/            -- Telnyx adapter behind a ProviderVoiceClient interface (later)
  realtime-ai/      -- OpenAI Realtime adapter behind a RealtimeAgentClient interface (later)
  email/            -- swappable email provider
  messaging/        -- WhatsApp / Viber / SMS adapters behind a common MessagingClient
  pms/              -- external PMS adapters
  calendar/         -- calendar sync adapters
```

Core domain logic depends only on the interface, never a concrete SDK, so Telnyx/OpenAI/
PMS/etc. can be swapped or mocked without touching business logic.

## 8. Audit log

A single append-only `audit_log` table (see `erd.md`) captures: actor (user id or `"ai"` +
agent/session id), action, target entity, organization/hotel scope, before/after payload
(jsonb), and timestamp. Every security-sensitive mutation and every AI-triggered data change
writes here — enforced via a shared `lib/audit.ts` helper called from Server
Actions/Route Handlers, not left to individual features to remember.

## 9. What's deliberately not here yet

Per your explicit scope for this phase: OpenAI Realtime voice connections, Telnyx call
routing, PMS database migrations, booking engine logic, payment processing, and full
integration connectors. The folder layout above reserves their place; none of their logic
exists yet.
