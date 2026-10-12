# Spico — Roadmap

Status of this document itself: **M0 through M12 are built**, plus the **M14** UI
stabilization / bug-fix sprint and the **M15** Live Voice MVP (real, credential-gated code —
locally verified, live activation pending credentials; see the M14/M15 sections at the end) —
every milestone originally planned (M0–M10) plus the M11 PMS follow-up and the M12
production-readiness follow-up. All 70
M1–M11 migrations (24 for M1–M3, 6 for M4, 4 for M5, 6 for M6, 3 for M7, 5 for M8, 5 for M9, 6 for
M10, 11 for M11) have been executed against the live Supabase project (project ref
`cwcmjtglxyojsjzvunsf`, region `eu-central-1`); M12's 5 migrations are written and pending an
explicit sign-off + `db push` — see the "Real Supabase activation" section of `assumptions.md`
for what was applied and verified, including a real security issue found and fixed live during
M11 (see that section). See the M12 section below for what it covers, and the note after it for
what a next milestone (M13+) might cover.

## M0 — Template audit & documentation (done)

- Inspected the template bundle, confirmed no live app exists yet.
- Decided: rebuild on Next.js App Router; keep Bootstrap + SCSS design system as-is.
- Produced `template-audit.md`, `architecture.md`, `erd.md`, `rbac.md`, `roadmap.md`,
  `assumptions.md`, `.env.example`.

## M1 — SaaS Foundation inside WebTemplate *(built 2026-07-23 — see below for status)*

Authentication, organizations, hotels, memberships, RBAC, audit log foundation, and Row
Level Security.

Delivered:
- Next.js 16 App Router project scaffolded in `WebTemplate/` (TypeScript strict, ESLint,
  Zod) — verified with a real `next build` + `tsc --noEmit` + `eslint .`, not just written.
- Template shell ported: `TopBar`/`LeftSidebar`/`DashboardShell` as App Router components,
  SCSS/Bootstrap design tokens, Font Awesome assets, Space Grotesk now actually loaded (see
  `assumptions.md`). Nav re-themed to the real Spico module list via `lib/nav.ts`, with
  placeholder pages for the 11 modules not built yet.
- Login/Register/Reset Password pages ported and wired to real Supabase Auth
  (`app/(auth)/actions.ts`).
- Supabase wiring: `lib/env.ts` (Zod-validated), `lib/supabase/{client,server,middleware}.ts`,
  root `middleware.ts` for session refresh + auth gating.
- 9 SQL migrations (`supabase/migrations/`): `profiles`, `roles`, `organizations`, `hotels`,
  `memberships`, `permissions`/`role_permissions`, `invitations`, `audit_log`, and a
  consolidated policies migration with `has_permission()`/`can_manage_membership()` SQL
  functions enforcing the `rbac.md` matrix (including rank-aware team management, so e.g. a
  Reception Manager can't promote anyone to Hotel Owner).
- `lib/authz.ts` (`requireUser`/`requirePlatformRole`/`requirePermission`) and
  `lib/audit.ts` (`writeAuditLog`).
- Screens: org creation/switcher (`/`, `/organizations/new`), hotel list/create
  (`/o/[orgSlug]`, `.../hotels/new`), Team & Roles (`.../team` — invite, change role,
  revoke), audit log viewers (org-scoped and platform-wide, read-only), platform admin
  (`/admin` — orgs list, suspend/reactivate, gated to `platform.admin`).
- Demo pages (Community Feed/Details, Image Generator, Voice Generator) were not carried
  into the new app at all — nothing to delete from the live project; the original template
  zips remain untouched as a reference archive.

Known gaps to close as fast-follows (see `assumptions.md` for full detail):
- Team & Roles is org-scoped only; a hotel-scoped equivalent for Hotel General Manager is
  not yet built.
- ~~**Migrations are unexecuted**~~ — **applied 2026-07-23** to the live project and verified
  (21 tables, RLS active, seeds: 5 roles / 26 permissions / 83 grants; auth→profile trigger +
  cascade exercised end-to-end).
- `lib/supabase/types.ts` is still hand-written; `supabase gen types` codegen is **deferred** —
  this CLI version routes `gen types` through a Docker container (Docker not running; C: nearly
  full). Regenerate later via Docker, or via the Management API with a personal access token.
  The hand-written file also carries domain union types (`PermissionKey`, `RoleKey`, …) the app
  imports, so any regeneration must preserve those, not blindly overwrite.

Explicitly **not** in M1 (unchanged from the plan): any hospitality-domain data
(reservations, PMS, guests, KB), voice/Telnyx, OpenAI Realtime, billing/payment, external
integrations, real analytics/charts. Placeholder nav entries and routes exist for these so
the shell and RBAC gating are already correct when each module lands.

## M2 — Real Supabase Activation & Hotel Operations Foundation *(built 2026-07-24)*

Delivered:
- `supabase init` scaffolded (`supabase/config.toml`); 6 new forward-only migrations
  (`hotels` profile columns, `departments`, `membership_departments`,
  `hotel_business_hours`, `hotel_holidays`, new permissions/role grants) — **executed
  2026-07-23** along with all other migrations. See `assumptions.md` for what was applied.
- Hotel Profile & Settings (`.../h/[hotelSlug]/settings`): full profile form (type, star
  rating, address, currency/locale, contact, check-in/out, up to 10 guest languages +
  default), gated by the existing `hotel.settings.manage` permission, audit logged.
- Departments (`.../departments`): create/edit/activate/deactivate, seeded automatically on
  hotel creation, active-code uniqueness enforced at the DB level, gated by new
  `departments.read`/`departments.manage` permissions.
- Business Hours & Holidays (`.../schedule`): weekly hours with optional split shifts,
  date-range holidays/exceptions with closed/modified-hours/special-operations status —
  a data foundation only, not yet consumed by any scheduling logic.
- Team & Roles: extended with per-member department assignment (hotel-scoped memberships
  only), preserving the existing rank-aware protection.
- Hotel dashboard: replaced the static placeholder with real active-team/active-department
  counts, profile-completeness indicator, permission-gated recent audit activity, and a
  polished per-module "not connected yet" grid (no fake calls/AI/reservations/revenue
  metrics).

This absorbs what the original roadmap called "Hotel Dashboard shell" — the per-hotel
dashboard is now real. An **org-level rollup dashboard across multiple hotels** is not yet
built; fold it into whichever future milestone first needs cross-hotel reporting.

Known gaps (see `assumptions.md`): logo/cover image are URL fields, not a Supabase Storage
upload widget; business-hours `effective_from`/`effective_to` are stored but not yet
resolved by any "current schedule" query; holidays support create/delete but not in-place
edit.

## M3 — AI Agent Configuration Foundation *(built 2026-07-25)*

Delivered:
- 9 new migrations (`ai_agents` + 7 child tables + permissions), all with RLS, forward-only,
  **executed 2026-07-23** (same as M1/M2 — see `assumptions.md`). `ai_agents` carries schedule-mode
  columns directly rather than a trivial extra settings table; every child table derives
  its tenant scope from `agent_id` via one shared trigger.
- 13 new granular `ai_agents.*` permissions (see `rbac.md`'s Milestone 3 section).
- Full agent lifecycle: list, create (seeds default language, all 19 capabilities, handoff
  rules, approval policy, and prompt version 1 in one action), Overview tab with
  activate/deactivate/archive.
- Languages, Capabilities (registry-driven from `lib/agentCapabilities.ts`, not
  hardcoded per-page), Schedule and Handoff (combined tab, override grid + human-handoff
  conditions/department/message), Approval Policy, and a structured Prompt and Versions
  editor (immutable version history, restore-as-new-version, platform-protected rules
  rendered read-only from `lib/agentPromptPolicy.ts` and never stored alongside
  hotel-editable content).
- Test Playground: pure configuration simulation (`lib/agentTestSimulation.ts`) — no AI
  provider, voice, or messaging call exists anywhere in this milestone's code.
- Hotel dashboard: active/draft agent counts, agents-requiring-configuration indicator,
  recent AI-agent audit activity — no fake calls/bookings/conversion metrics.

Known gaps (see `assumptions.md`): "agent needs ≥1 enabled language"/"default language must
be enabled" are application-enforced, not DB-enforced (a cross-row/cross-table invariant
that needs a deferred constraint trigger to get right, not attempted without a live
database to test against); Reception Manager's "manage limited configuration if granted"
has no per-user override UI yet, so the baseline seed keeps that role at read/test only.

## M4 — Knowledge Base Foundation *(built 2026-07-26 — executed against the live DB)*

Delivered:
- 6 new migrations (`kb_categories`, `kb_articles`, `kb_documents`,
  `ai_agent_knowledge_sources`, a `kb-documents` Storage bucket + `storage.objects` RLS, and
  M4 permissions), all with RLS, forward-only. Unlike M1–M3, these were **applied to the live
  Supabase project the same session** and verified (tables reachable, RLS active, 31 total
  permissions, private bucket present with a 25 MB limit + MIME allow-list).
- 5 new permissions (`kb.read`, `kb.categories.manage`, `kb.articles.manage`,
  `kb.documents.manage`, `ai_agents.manage_knowledge`) — see `rbac.md`'s Milestone 4 section.
- Knowledge Base module (`.../knowledge-base`, first-class nav entry, no longer a placeholder):
  tabbed Overview / Categories / Articles / Documents. Categories group content; Articles are
  hand-authored FAQ/policy/article/snippet entries with draft→published→archived status;
  Documents support **real Supabase Storage file upload** (PDF/TXT/MD/CSV/DOC/DOCX, ≤25 MB,
  private bucket, short-lived signed-URL downloads) and external-URL linking, with a
  `processing_status` foundation.
- Agent **Knowledge** tab (`agents/[agentId]/knowledge`): enable/disable the KB for an agent
  (consuming M3's previously-unused `ai_agents.knowledge_base_enabled`) and assign sources
  (entire KB / a category / a document / an article), gated by `ai_agents.manage_knowledge`.
- Hotel dashboard gained a Knowledge Base article/document count; KB registry/constants live
  in `lib/knowledgeBase.ts` (the same in-code registry pattern as `lib/agentCapabilities.ts`).

Foundation only, honestly labelled throughout: **no chunking, embedding, vector index, or
retrieval/RAG execution exists** — "stored" means a file is saved raw and available, not
vector-indexed. The live retrieval pipeline that consumes these assignments lands in a later
milestone.

Known gaps (see `assumptions.md`): `processing_status` never leaves `pending`/`ready` in M4
(no ingestion pipeline sets `processing`/`failed` yet); article/document `language_code` is
validated against the hotel's configured guest languages in the server action, not by a DB
constraint; the agent↔source "belongs to same hotel" check is app-enforced (cross-table), same
category of invariant as M3's; `lib/supabase/types.ts` gained the 4 new tables by hand
(codegen still deferred — see the activation notes).

## M5 — Omnichannel Inbox skeleton *(built 2026-07-27 — executed against the live DB)*

Delivered:
- 4 new migrations (`channels`, `conversations`, `messages`, M5 permissions), all with RLS,
  forward-only, **applied to the live project** (34 migrations total; 35 permissions).
- 4 new permissions (`inbox.view`, `inbox.send`, `inbox.manage`, `channels.manage`) — see
  `rbac.md`'s Milestone 5 section. Unlike M1–M4 read permissions, `inbox.view` is **not**
  granted to Platform Moderator (conversations carry guest PII).
- Inbox module (`.../inbox`, first-class nav entry): conversation list with status filters,
  a thread view with message bubbles + reply composer, compose-new-conversation, and
  assign/status/priority controls. Channels management (`.../inbox/channels`).
- **Provider adapters are stubbed** behind a code-level `ChannelAdapter` interface
  (`lib/inboxChannels.ts`): every channel resolves to a `StubChannelAdapter` whose `send()`
  stores the message and transmits nothing (returns `sent` with an explicit no-op note). No
  email/SMS/WhatsApp/Viber/voice provider is connected. The seam to swap in a live adapter is
  `getChannelAdapter()`, used by every send path.
- Hotel dashboard gained an open-conversation count.

Skeleton only, honestly labelled throughout: composing/replying records messages in the DB
but sends nothing to the outside world; inbound messages have no ingestion path yet (they
arrive once a live provider adapter exists). The template's Chatbot page was used as visual
inspiration for the thread bubbles rather than ported verbatim (it lives only in the
un-extracted React zip; the new thread UI is built on the existing Spico design system).

Known gaps (see `assumptions.md`): no inbound message path (needs a live provider/webhook);
messages are immutable with no edit/delete; `delivery_status` never leaves `sent` in the
skeleton; `config` on channels is an unused jsonb placeholder for future provider credentials.

## M6 — Reservations & PMS *(core built 2026-07-28 — executed against the live DB)*

Delivered (core PMS):
- 6 new migrations (`room_types`, `rooms`, `rate_plans`, `guests`, `reservations`, M6
  permissions), all with RLS, forward-only, **applied to the live project** (40 migrations
  total; 33 tables; 41 permissions).
- 6 new permissions (`pms.read`/`pms.manage`, `guests.read`/`guests.manage`,
  `reservations.read`/`reservations.manage`) — see `rbac.md`'s Milestone 6 section. Receptionist
  gets full front-desk ops (guests + reservations) and read-only room inventory.
- **Rooms & Rates** module (tabbed): room types (with base rate, occupancy), rooms (with
  housekeeping status), and rate plans (flat nightly price per type).
- **Guests** module: guest profiles (PII, VIP flag).
- **Reservations** module: list with status filters, create-booking with **computed
  availability** (rooms of a type minus overlapping occupying reservations — no stored
  inventory), and a detail view driving the full lifecycle: confirm → assign room & check in
  (with a double-booking guard) → check out (marks the room dirty), plus cancel / no-show.
  Nightly total is computed from the rate plan or the room type's base rate.
- Hotel dashboard gained a **Front desk (today)** row: arrivals, departures, in-house,
  occupancy %.

Deliberately deferred to a follow-up PMS milestone (this was scoped as the core; the roadmap
always flagged M6 as splitting): a full **housekeeping** workflow (assignments/inspection
beyond the per-room status flag), **folio / billing / payments**, **channel-manager / OTA
sync**, **seasonal / length-of-stay rate calendars**, and a stored per-night inventory table
(availability is computed for now). No DB exclusion constraint prevents an overlapping room
assignment — the check-in action enforces it in application code.

## M7 — Public Booking Engine *(built 2026-07-29 — executed against the live DB)*

Delivered:
- 3 new migrations (`booking_settings`, the public booking RPCs, M7 permission), applied to the
  live project (43 migrations total; 34 tables; 42 permissions).
- **Public, unauthenticated guest flow** at `/book/[hotelSlug]` (a new `(public)` route group;
  middleware split so `/book/*` is reachable by anyone and never redirected). Guests search
  dates + party size, see **real availability + prices** (computed from M6 rooms/reservations/
  rate plans), and submit a booking → a `pending` reservation (`source = 'booking_engine'`)
  appears in the internal Reservations screen for staff to confirm (M6 lifecycle).
- **Security model — no anon table access.** The entire public surface is four
  `SECURITY DEFINER` RPCs (`booking_hotel_public`, `booking_room_type_offers`,
  `booking_rate_plans_public`, `booking_create`) with EXECUTE granted to `anon`. Guests never
  read/write base tables (verified: anon reading `reservations` returns nothing), so no other
  guest's PII is exposable. `booking_create` re-validates enabled/dates/occupancy/**availability**
  server-side inside the function, so an anonymous caller cannot overbook or bypass stay limits.
- **Internal config** at `.../booking` (permission `booking.manage`, GM/Owner + Reception
  Managers Manager): enable/disable online booking, min/max nights, guest-facing terms, and the
  shareable public URL.

Deliberately out of scope (foundation): payment capture / deposits (bookings are unpaid
requests), abuse rate-limiting on the public RPCs, availability that reflects held/expiring carts,
and a guest-facing booking-lookup/cancel page. Noted in `assumptions.md`.

## M8 — Voice: Telnyx + OpenAI Realtime *(foundation built 2026-07-30 — executed against the live DB)*

Delivered:
- 5 new migrations (`hotel_voice_settings`, `calls`, `call_events`, `call_recordings` —
  foundation only, `permissions_m8`), applied to the live project (48 migrations total; 38
  tables; 45 permissions).
- **`voice-service/`** — a genuinely separate persistent Node.js service (own `package.json`,
  `node_modules`, `tsconfig.json`; excluded from the main app's `tsc`/`eslint`/`next build`).
  Runs an HTTP server (`/health`, `/webhooks/telnyx` stub, `/calls/simulate` test harness) and a
  stub WebSocket endpoint (`/realtime`). Rationale for the separate service: a live call needs a
  long-lived connection (Telnyx media stream ↔ OpenAI Realtime bridge) that Vercel's serverless
  functions cannot hold open — see `voice-service/README.md`.
- **Every provider integration is a stub adapter** (`StubTelnyxAdapter`, `StubRealtimeAdapter`),
  mirroring M5's `ChannelAdapter` pattern — no live Telnyx account or OpenAI Realtime session
  exists. The one thing that's genuinely wired end-to-end is the **simulate-call test path**: it
  resolves a hotel's `hotel_voice_settings` + its assigned M3 AI agent (languages, handoff
  rules), runs a handoff-decision heuristic, and writes real `calls`/`call_events` rows —
  verified against the live DB (auth, error handling, and a real Supabase round-trip all
  confirmed via curl).
- Internal dashboard: **Calls** (history with disposition filters, event timeline, staff notes,
  "mark handoff completed") and **Voice Settings** (enable, phone-number placeholder, default
  AI agent) tabs under a hotel. Dashboard gained a Voice stats row (calls today, awaiting
  handoff).
- 3 new permissions (`voice.manage`, `calls.read`, `calls.manage`) — see `rbac.md`.

This is the connection point the roadmap promised — a hotel's M3 agent configuration now
concretely drives a call's disposition — but the "voice/messaging path" itself is simulated,
not live. `voice-service/README.md` lists the exact steps (Telnyx account, webhook signature
verification, real Realtime WebSocket bridge, a persistent deployment target) still needed to
make it real.

Known gaps: no inbound path from a real Telnyx webhook (accepted and acknowledged, not
processed); `call_recordings` has no Storage bucket (foundation column only); `calls.conversation_id`
is an unused seam for a future call-as-conversation link into M5's inbox.

## M9 — Integrations, API keys, webhooks *(built 2026-07-31 — executed against the live DB)*

Delivered:
- 5 new migrations (`api_keys`, `webhooks`, `webhook_deliveries`, `integrations` connector
  foundation, `permissions_m9`), applied to the live project (53 migrations total; 42 tables;
  49 permissions).
- **A real, working Open API** at `app/api/v1/*` (Next.js Route Handlers, new to the codebase
  this milestone) — `GET /availability` and `POST /reservations`, authenticated via `Authorization:
  Bearer <api key>` (never a Supabase session) and scope-checked (`read:availability`/
  `write:reservations`). Availability is computed the same way as M6/M7 — never invented. A
  required middleware fix shipped alongside: `/api/*` had to be added to a new
  "no session" bypass, since the existing auth middleware was redirecting *every* unauthenticated
  request (including API calls) to `/login` before this milestone.
- **API keys are real**, not simulated: SHA-256-hashed (only the hash is stored), shown once in
  plaintext at creation via a `useActionState` reveal (same pattern as org creation), scoped to a
  curated set of Open API scopes (not the full internal permission surface).
- **Webhook delivery is real but synchronous**: up to 3 inline retry attempts with backoff,
  real HMAC-SHA256 request signing (`X-Spico-Signature`), delivery logged to
  `webhook_deliveries` with an idempotency key preventing duplicate delivery of the same event.
  No durable queue/worker — see known gaps. Wired into every reservation-lifecycle entry point:
  internal create/status-change/check-in/check-out (M6), the public booking engine (M7), and the
  new API's own `POST /reservations`.
- **Rate limiting + request idempotency via Upstash's REST API** (`lib/rateLimit.ts`, plain
  `fetch` calls, no new SDK dependency) — gracefully inactive (not faked) when
  `UPSTASH_REDIS_REST_URL`/`TOKEN` are unset, which they are in this environment; every response
  carries an `X-RateLimit-Configured` header saying so honestly.
- **PMS/CRM/calendar/channel-manager connectors are a stub foundation**, same "provider is
  always `'stub'`" pattern as M5/M8 — "Test connection" always reports not connected.
- Internal dashboard: **Integrations** tab group (API Keys / Webhooks / Connectors) under a
  hotel; dashboard gained an active-API-keys/active-webhooks stat row.
- `lib/supabase/admin.ts` — a new service-role Supabase client, the first in the main Next.js
  app (voice-service already had its own). Reserved for genuinely system-triggered writes
  (webhook delivery, the API routes) that must not be gated by the acting user's own
  permissions — RLS stays the ground truth everywhere else.

Verified against the live DB: internal `/integrations/*` routes 307 to `/login` unauthenticated;
`/api/v1/*` routes correctly do **not** redirect (confirming the middleware fix) and return
proper JSON 401s for a missing/invalid API key, including a real DB round-trip (an invalid key
is checked against the live `api_keys` table, not just rejected on shape). A full success run of
`POST /api/v1/reservations` was not exercised this session — the user's one hotel exists but is
still `onboarding` status (the route requires `active`), and no test data was written into the
live tenant to force it (see `assumptions.md`).

Known gaps: webhook delivery has no durable queue — a delivery that exhausts its 3 inline
retries is marked `failed` and nothing retries it later (a real queue-backed version, or a
worker analogous to `voice-service`, is future work); `POST /webhooks/telnyx`-style inbound
webhook *receiving* from an external PMS/CRM was not built (M9 only covers *outbound* webhooks
Spico sends); the Open API surface is 2 endpoints, not a full REST API — more endpoints follow
the same `lib/apiAuth.ts` pattern.

## M10 — Billing/payment, full platform administration polish *(built 2026-08-01 — executed against the live DB)*

Delivered:
- 6 new migrations (`plans`, `organization_subscriptions` + auto-seed-on-org-creation trigger
  + a one-time backfill for orgs created before this milestone, `platform_settings` singleton,
  `platform_moderation_flags`, `permissions_m10`), applied to the live project (59 migrations
  total; 46 tables; 51 permissions).
- **Org-facing Billing page** (`.../o/[orgSlug]/billing`, gated by new org-scoped `billing.read`/
  `billing.manage` permissions, granted to **Hotel Owner only** — the first hotel-wide-config
  permission in the project withheld even from Hotel General Manager, since a plan change has
  direct financial consequences most SaaS products reserve for the account owner). Pricing-tier
  grid + FAQ accordion ported from the template's `ManageSubscription` page exactly as
  `template-audit.md` flagged it for — reimplemented with native `<details>/<summary>` (no
  Bootstrap JS, consistent with M1 dropping `react-bootstrap`).
- **Payment processing is a stub** (`lib/billing.ts`, same pattern as every other external
  integration in this project) — plan changes are immediate and unpaid; nothing is charged, no
  gateway is contacted. Every organization is auto-enrolled on the free `starter` plan
  (`trialing` status) the moment it's created.
- **Platform admin, extended**: `/admin/plans` (catalog CRUD, **superadmin-only** writes — the
  single highest-blast-radius permission tier in the project, since a price change affects every
  tenant at once), `/admin/settings` (platform name/support email/maintenance-mode/announcement,
  admin+superadmin writes, matching the existing org-suspend tier), `/admin/moderation`
  (flag an organization or hotel for review).
- **Moderation tooling for Platform Moderator** — its first genuinely actionable capability;
  previously read-only everywhere. Any platform role can raise a flag; only admin/superadmin can
  resolve one or act on it (e.g. suspend, from the existing Organizations page, which now also
  shows each org's id for copy-paste into the flag form) — mirrors the real "mods flag, admins
  act" moderation pattern.

Verified against the live DB: 3 starter/professional/enterprise plans seeded; the singleton
`platform_settings` row present; every existing organization (including the user's) backfilled
with a `starter`/`trialing` subscription; anon correctly blocked from reading `plans`/
`platform_settings` (both are `to authenticated` only — unlike M7's deliberately anon-readable
booking RPCs); all new admin/billing routes 307 to `/login` unauthenticated.

Known gaps: `maintenance_mode`/`announcement_message` are stored but not yet read by any
page (no maintenance banner exists); plan limits (`max_hotels`/`max_users`) are not enforced
anywhere — an org on Starter can still create unlimited hotels; `platform_moderation_flags.
target_id` is not a DB foreign key (validated in the server action instead, since it can point at
either `organizations` or `hotels`).

## M11 — PMS completion: housekeeping, folio & billing, channel manager sync, seasonal rates *(built 2026-08-02 — executed against the live DB)*

The PMS follow-up flagged back in M6's known gaps. Delivered:
- 11 new migrations (`rate_plan_seasons`, `folios`, `folio_line_items`, `folio_payments`, shared
  pricing/folio SQL functions, a `booking_create` replacement to use them, `housekeeping_tasks`,
  `channel_manager_sync_logs`, `permissions_m11`, and **two follow-up security-fix migrations**
  — see below), applied to the live project (70 migrations total; 52 tables; 55 permissions).
- **Housekeeping workflow**: an assignable task board (`.../housekeeping`) with a real lifecycle
  (pending → in_progress → completed → verified). A `checkout_clean` task is auto-created when a
  reservation checks out (alongside the existing M6 dirty-flag); verifying a task clears the
  room back to clean. Granted at the Receptionist base tier (daily front-desk work).
- **Folio & billing, real**: every reservation — created internally (M6), via the public booking
  engine (M7), or via the Open API (M9) — now gets a real folio with one `room`-category line
  item per night, computed by one shared SQL function (`create_reservation_folio`) so all three
  paths behave identically. Staff can add extra charges/taxes/adjustments and record payments
  (folio balance = charged − paid, computed in `lib/folio.ts`). **Payment recording is a stub**
  (`provider = 'stub'`) — same discipline as every other external integration in this project;
  no live payment gateway is connected, recording a payment means staff noted cash/card/transfer
  was received, nothing was actually charged.
- **Seasonal rate calendars**: date-range nightly-price overrides per rate plan
  (`.../pms/rates/[ratePlanId]`), resolved by a single shared SQL function
  (`rate_plan_nightly_rate`) used by ALL THREE reservation-pricing paths — including a live
  replacement of M7's `booking_create` RPC — so a seasonal override prices identically no matter
  where a booking originates.
- **Channel manager sync — real data assembly, stub delivery**: a connector detail page
  (`.../integrations/connectors/[connectorId]`) with three "Sync now" actions (push rates, push
  availability, pull reservations) that genuinely query this hotel's live inventory/availability/
  reservations and log exactly what WOULD be sent to an OTA — but nothing is ever transmitted;
  no live channel-manager account or HTTP call exists (same stub discipline as M5/M8/M9).

**A real security issue was found and fixed live during this milestone**, not just theorized:
verification calls proved `create_reservation_folio` (a `SECURITY DEFINER` function that bypasses
RLS) was callable directly by an **anonymous** user despite only an explicit `authenticated`
grant — PostgreSQL grants `EXECUTE` to `PUBLIC` by default on new functions, and Supabase
separately auto-grants `anon`/`authenticated` their own direct execute rights, neither of which a
same-migration `grant ... to authenticated` alone removes. Two follow-up migrations
(`20260802190010`, `20260802190011`) explicitly revoked `EXECUTE` from `PUBLIC` and then from
`anon` specifically before the gap actually closed (the first attempt, revoking only from
`PUBLIC`, was verified live and found insufficient) — confirmed via a second round of live
anon-vs-authenticated calls before being treated as fixed. See `assumptions.md` M11 for the full
account and what it means for writing new `SECURITY DEFINER` functions going forward.

Known gaps: no overlap-prevention for `rate_plan_seasons` (most-specific-range wins,
deterministically, but two seasons for the same plan CAN overlap); folios are strictly 1:1 with a
reservation (no free-standing/incidental folio for a walk-in with no reservation); channel-manager
sync has no scheduled/automatic runs, only manual "Sync now"; no full end-to-end success run of
the folio/housekeeping/sync flows was exercised this session (the user's hotel has no inventory
yet — see `assumptions.md`).

## M12 — Production Readiness, Onboarding, Plan Enforcement, and Test Data *(built 2026-08-03 — migrations pending live sign-off)*

Makes the existing Spico foundation safe and practical for real internal testing and pilot-hotel
onboarding — not a new product module. Deliberately does NOT implement live Telnyx calls,
OpenAI Realtime, live email/SMS/WhatsApp delivery, payment gateways, or a real OTA connector.

Delivered:
- **Onboarding completion flow**: a reusable readiness-check registry (`lib/hotelReadiness.ts`,
  9 real database-backed checks — profile completeness, timezone, guest language, active
  department, business hours for all 7 days, active room type/room/rate plan, an authorized
  Hotel Owner membership), a checklist page (`.../onboarding`) linking out to the existing pages
  that own each piece of configuration, and a new `hotel.activate` permission + action that
  re-runs every check server-side before allowing `onboarding` -> `active`. Voice configuration
  and payment/billing are explicitly never required to activate. The hotel-status field was
  removed from the free-form settings form (previously anyone with `hotel.settings.manage`
  could flip status with zero gating) and replaced with a read-only badge.
- **Safe demo/test-data seeding tool** (`.../test-data`): idempotent `seed_hotel_test_data()`/
  `remove_hotel_test_data()` SQL functions seed labelled room types/rooms/rate plans/guests/
  reservations (different lifecycle states)/one draft AI agent/KB content/a sample inbox
  conversation/disabled booking settings — every row tagged `is_test_data = true` (a new column
  on 12 tables) and visibly labelled "Test Data — Not a Real Guest or Reservation". Gated by a
  new `ENABLE_DEMO_DATA_SEEDING` env flag (default false) AND a hand-rolled Hotel-Owner-or-
  Platform-Superadmin check (`lib/demoData.ts`) that deliberately excludes Platform Admin —
  `has_permission()`'s built-in platform bypass admits both, so this is the first feature in the
  project that cannot use the standard permission path (see `docs/rbac.md`).
- **Subscription plan-limit enforcement** (`lib/planLimits.ts`): reads `max_hotels`/`max_users`
  from the org's actual subscription+plan (never hardcoded), blocks only new hotel creation or
  new invitations once the limit is reached, never blocks existing access. Fails closed if an
  organization has no subscription row at all.
- **Invitation acceptance** (`.../invite/[token]`, `accept_invitation()` SQL function): closes a
  genuine pre-existing gap — invitations could be created since M1 but nothing ever converted
  one into a membership. Re-checks the plan's `max_users` limit at accept time as well as invite
  time. The Team page now surfaces the shareable invite link.
- **Platform bootstrap documentation** (`docs/platform-bootstrap.md`): the exact SQL to grant
  the first platform operator (moderator/admin/superadmin), including the discovered gotcha that
  the `platform_role` guard trigger fires even for a raw SQL Editor connection (`auth.uid()` is
  `NULL` there) and must be disabled/re-enabled around the single `UPDATE`.
- **Production safety review** (`docs/security-followups.md`): a checklist of what needs live
  verification once the M12 migrations are applied (new `SECURITY DEFINER` grants, the
  hand-rolled owner/superadmin check, RLS coverage on the 12 newly-tagged tables) plus accepted
  residual risk, documented rather than silently shipped.
- **Operational health page** (`/admin/system-health`, Platform Admin/Superadmin only): Supabase
  config/DB connectivity/storage bucket/Upstash/API-key/webhook/connector status using a fixed
  truthful vocabulary (Configured/Not configured/Reachable/Unreachable/Not tested/Stub mode),
  never exposing secrets. Voice status stays database-derived only (no HTTP call to
  `voice-service`) — deliberately preserving M8's service decoupling. Per-hotel activation
  readiness is also surfaced on the hotel dashboard when a hotel isn't yet active.

Known gaps/decisions (see `assumptions.md` M12 for full reasoning): `timezone_configured` can
never actually fail (the column has a `NOT NULL DEFAULT 'UTC'`); no hotel-suspend workflow was
built (only organizations can be suspended today); `supabase gen types` codegen is still a
documented-workflow deliverable, not executed live this session (no DB password/access token
available in this environment) — `lib/supabase/types.ts` was hand-extended instead.

## What's next (not built — no milestone currently planned beyond M12)

Every milestone in the original roadmap (M0–M10) plus the M11 PMS follow-up and M12's
production-readiness follow-up are now built. Natural next directions, none scoped or started:

**Milestone 13: Live Voice MVP** — Telnyx inbound call control, verified webhooks, OpenAI
Realtime session bridge, real human call transfer, call lifecycle events, recordings policy, and
production-safe fallback handling (see `voice-service/README.md` for the exact stub-to-live
steps this would replace).

Other unscoped directions: a real payment gateway (folio payments and platform billing are both
stubs); a durable webhook delivery queue per M9's known gap; a real OTA/channel-manager vendor
integration behind M9/M11's connector foundation; `rate_plan_seasons` overlap prevention; running
`supabase gen types` for real once a DB password or Management API token is available (see
`assumptions.md` M12 #7). Pick a direction when ready — none of this is assumed or pre-committed.

## M14 — Local launch, UI stabilization & bug-fix sprint *(done 2026-07-27)*

Started the app locally against the real Supabase project, audited the accessible UI surface,
and fixed confirmed defects without changing business logic, the design system, or the DB
schema. Full detail in `docs/ui-bug-audit.md`. Highlights:

- **Recovered a crashed dev server** (stale Turbopack worker pool 500'ing every route) via a
  clean restart + `.next/dev/lock` removal — not a code defect (BUG-01).
- **Added confirmation to all destructive actions** (Revoke member / API key, Delete webhook /
  document, Remove connector / rate season / knowledge source, Remove holiday) via a new
  reusable `components/ui/ConfirmSubmitButton.tsx` (confirm() gate + pending-disable). Critical
  fix — previously a single misclick was irreversible (BUG-02).
- **Fixed the broken top-bar Profile link** by adding a read-only `/profile` account page
  (BUG-03).
- **Fixed sidebar active-state** so only the most-specific nav item highlights (BUG-04).
- **Made shared tables mobile-safe** (horizontal scroll container under 768px) (BUG-05).
- **Improved the app error boundary** (retry + home, no raw error leak) and **added a branded
  global 404** (`app/not-found.tsx`) (BUG-06/07).
- Verified: `tsc --noEmit`, `eslint .`, and `next build` all clean.

Deferred (documented, not silently dropped): labeled mobile nav drawer (currently an icon
rail), pending states on non-destructive forms, `middleware`→`proxy` rename, and the Sass
module-system migration for the `@import`/global-function deprecation warnings.

## M15 — Live Voice MVP *(code built + locally verified 2026-07-27; live activation pending credentials)*

Replaced the M8 stub voice pipeline with a real, credential-gated implementation in
`voice-service/`. Everything is real code that switches from stub → live automatically based
on which credentials are present (no mode flag). Full detail + activation runbook in
`voice-service/README.md`. Delivered:

- **Telnyx webhook Ed25519 signature verification** (`src/telnyxSignature.ts`) — verifies the
  `telnyx-signature-ed25519`/`telnyx-timestamp` headers against `TELNYX_PUBLIC_KEY` with a
  replay-tolerance window. Unsigned/tampered/stale requests are rejected 401; a webhook is
  never allowed to drive call control unverified.
- **Real Telnyx Call Control adapter** (`src/telnyxAdapter.ts`) — answer / hangup / transfer /
  streaming_start / speak via the v2 REST API, behind the same interface as the stub.
- **Live inbound call handling** (`src/callHandler.ts`, `src/server.ts`) — verified events
  (`call.initiated`/`answered`/`hangup`) map the dialed number → hotel → default agent, create
  `calls`/`call_events`, answer, and start bidirectional media streaming.
- **OpenAI Realtime audio bridge** (`src/realtimeBridge.ts`) — relays Telnyx μ-law 8kHz media
  ⇄ an OpenAI Realtime session (formats match: PCMU == g711_ulaw, no transcoding), using the
  agent's real composed instructions (platform-protected rules + active prompt version).
- **AI agent tool execution** (`src/tools.ts`) — capability-gated tools executed against the
  live DB: `check_availability` (booking RPC), `lookup_reservation` (with last-name
  verification before disclosing details), plus `transfer_to_human` / `end_call` control tools.
- **Real human transfer + production-safe fallback** (`src/fallback.ts`) — any failure (no
  agent, provider error, no public URL, OpenAI unreachable) transfers to `VOICE_FALLBACK_NUMBER`
  or speaks an apology and hangs up; the caller is never left on dead air.

Verified locally: `npm run typecheck`, `npm run build`, `npm run selftest` (15 checks:
signature accept/reject/tamper/stale/missing, decision heuristic, tool gating, fallback), and a
boot smoke test against the real Supabase DB (health, 401 on unsigned/tampered webhooks, signed
`call.initiated` routed through a real DB lookup + fallback). **Not yet verified:** real Telnyx
REST calls, the live OpenAI Realtime audio bridge, and an end-to-end PSTN call — these need live
credentials + a public deployment (runbook in `voice-service/README.md`).

## Recommended next — Milestone 16: Voice hardening + live activation

Complete the live call test with real credentials, then harden: durable active-call correlation
(add `provider_call_id` to `calls`), computed `duration_seconds`, call recording into the
existing `call_recordings` table, per-tenant OpenAI/Telnyx usage metering, and the
booking-creation / reservation-modification voice tools behind the approval workflow (currently
those capabilities transfer to a human rather than auto-executing on a call).
