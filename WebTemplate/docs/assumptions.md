# Spico — Assumptions & Open Questions

Recorded so decisions made during this audit (and the next milestone) are traceable and
revisitable.

## Decisions already confirmed with you (2026-07-23)

1. **Framework**: rebuild on Next.js App Router; do not extend the template's Create React
   App as-is. See `template-audit.md` §9, `architecture.md` §2.
2. **Styling**: keep Bootstrap 5 + the template's custom SCSS design system; do not convert
   to Tailwind. This deviates from the generic "use Tailwind" line in your technical
   direction — accepted deviation, in favor of preserving the purchased design and reducing
   rework/regression risk.

## Assumptions made without an explicit answer (flag if wrong)

1. **Package manager**: no `.npmrc`/`yarn.lock` policy specified — will default to `npm`
   for the new Next.js project unless you prefer `pnpm`/`yarn`. Low cost to change before
   M1 starts, higher cost after.
2. **Next.js version**: "Next.js 14+" assumed acceptable; will use the current stable minor
   at implementation time rather than pinning to an exact version now.
3. **Supabase project**: assumed not yet created. `.env.example` ships with placeholder
   values only; you'll need to create the actual Supabase project and provide real
   credentials via `.env.local` (never committed) before M1's auth/DB work can run
   end-to-end.
4. **Node.js runtime version**: not specified — will target the current Node LTS at
   implementation time (Vercel's default) unless you have an existing constraint.
5. **Font Awesome 6 Pro licensing**: the template bundle includes the full Pro family
   (brands/duotone/light/regular/solid/thin). Assumed your template purchase's license
   covers embedding these fonts in the commercial Spico product. Not verified — please
   confirm, since this affects whether the font files can ship as-is or need to be
   swapped/re-licensed.
6. **Space Grotesk font source**: the SCSS references `'Space Grotesk'` as the primary
   typeface, but the font files themselves aren't in the zip (likely loaded via Google
   Fonts `<link>` in the original HTML template). Assumed we'll self-host it via
   `next/font/google` for performance/privacy rather than a runtime CDN link — flag if you'd
   rather keep the CDN link.
7. **Demo content removal**: assumed Community Feed/Details, Image Generator, and Voice
   Generator pages should be dropped rather than repurposed, since none map to a hospitality
   concept even loosely. Per your delete-approval rule, no source files have been deleted
   yet — this will be called out explicitly again before deletion happens in M1.
8. **`__MACOSX` folder**: a macOS zip-extraction artifact sitting alongside the template
   zips, not part of the purchased template or any real project content. Left untouched;
   flagging as safe-to-delete pending your confirmation rather than removing it unilaterally.
9. **"Up to 10 configurable languages per hotel"**: modeled in `erd.md` as a `jsonb` column
   on `hotels` for now (a list, not yet a normalized table), since no UI or per-language
   business logic exists yet to justify a richer schema. Expected to be revisited once the
   AI Agents milestone defines what actually varies per language (prompts? voice? schedule?).
10. **Reception Managers Manager scope**: assumed to be modeled as multiple `memberships`
    rows (one per hotel managed) rather than a dedicated "managed hotels" join table — see
    `rbac.md` §5 for the reasoning and the condition under which this should be revisited.
11. **Vercel/Supabase org ownership**: assumed you (or MITM) will provision the actual
    Vercel project and Supabase project/organization when M1 starts; this audit does not
    assume any hosting account has been created yet.

## Decisions made while implementing M1 (2026-07-23)

1. **Package versions pinned below "latest"**: `typescript` is pinned to `5.9.3` (not the
   newly-current `7.0.2`) and `eslint` to `9.39.5` (not `10.7.0`). Both "latest" versions
   caused real build/lint failures — `eslint-config-next`'s bundled `typescript-eslint`
   only supports `typescript <6.1.0`, and `eslint-config-next` still assumes ESLint 9's
   plugin API. Confirmed via an actual `next build`/`eslint .` run, not just a version
   check. Revisit these pins independently as the Next.js toolchain catches up.
2. **Zod API surface kept deliberately narrow**: only `z.object/string/enum/optional`,
   `.min()`, `.regex()`, and `safeParse()` are used — no `z.email()`/`z.uuid()`/`z.url()` or
   their `.string()`-chained equivalents, since Zod 4 changed this surface and it wasn't
   worth the risk of an unverifiable API guess. Basic email shape is checked via
   `.regex()`. Revisit once there's a concrete reason to want stricter format validation.
3. **`lib/supabase/types.ts` is hand-written, not codegen'd** (no live Supabase project to
   run `supabase gen types` against yet). It must satisfy `@supabase/postgrest-js`'s
   `GenericTable` shape exactly — every table needs a `Relationships: []` field and the
   schema needs a `Views` map, or `.update()`/`.insert()` silently type as `never`. Found
   this the hard way via a real `next build` typecheck failure. **Replace this file with
   real generated types** the first time a live Supabase project exists, rather than
   hand-maintaining it long-term.
4. **`react-hook-form`/`@hookform/resolvers`/`react-bootstrap` were removed** from
   `package.json` after building every M1 form — React 19's `useActionState` plus native
   `<form action={serverAction}>` covered every case without them, and nothing ended up
   importing `react-bootstrap`'s JS components (only its CSS, via the Bootstrap import in
   `styles/main.scss`). Re-add if a later milestone genuinely needs them (e.g. a Tab/Modal
   component), rather than carrying unused dependencies.
5. **Team & Roles is org-scoped only** (`/o/[orgSlug]/team`), not also exposed at
   `/o/[orgSlug]/h/[hotelSlug]/team`. This means a Hotel General Manager whose only
   membership is hotel-scoped (no org-wide membership) cannot currently reach a Team &
   Roles screen, even though `rbac.md`'s matrix grants that role `team.view`/`team.manage`
   at hotel scope. The RLS/`has_permission` model already supports hotel-scoped checks
   correctly — only the UI route is missing. Flagged as a fast-follow, not silently
   dropped.
6. **Space Grotesk is now actually loaded** via `next/font/google` (`app/layout.tsx`) and
   mapped onto the existing `--font-primary`/`--font-secondary` CSS variables in
   `styles/spico.scss`. The original template's SCSS referenced the font by name but never
   loaded it — likely a `<link>` in the original static HTML that didn't survive the port
   to the React variant. This was a real, fixable design-fidelity gap, not just noted.
7. **`.env.local` contains placeholder (non-real) Supabase values** so `next
   build`/`next dev` can run without a live project — Zod's env validation and the
   Supabase client constructors need syntactically-present values even though no network
   call to them succeeds. **The SQL migrations in `supabase/migrations/` have not been
   executed against any real database** — no live Supabase project was available in this
   session. Run them (via `supabase db push` or the SQL editor) against a real project
   before relying on auth/org/hotel features, and replace `.env.local` with real
   credentials at that point.
8. **`npm`'s cache was redirected to `D:\npm-cache`** for all installs in this session
   because `C:` had 0 bytes free, which made the default cache location
   (`C:\Users\<you>\AppData\Local\npm-cache`) unwritable. This is a symptom of a real
   environment issue — see the note below — not a permanent project configuration; a future
   session with a healthy `C:` drive doesn't need it, though pointing npm's cache at `D:`
   permanently isn't a bad idea given the free space split.

## Decisions made while implementing M2 (2026-07-24)

1. **Logo/cover image are plain URL text fields, not a Supabase Storage upload widget.**
   "Manage a hotel logo" is satisfied by a URL field; building an actual upload flow means
   a storage bucket, storage-level RLS policies, and dropzone UI — a distinct feature, not
   a form field. Revisit when there's an actual reason a hotel won't just host its own logo
   image (e.g. brand asset management becomes a real request).
2. **`hotel_type` is a curated 7-value enum** (`hotel`/`resort`/`boutique`/`hostel`/
   `apartment`/`guesthouse`/`other`), CHECK-constrained at the DB level like the other M1
   status fields, rather than free text. Extend the CHECK (a forward-only migration) if a
   new category is genuinely needed rather than loosening it to free text.
3. **`departments.read`/`schedules.read`/`holidays.read` were added as new permissions
   rather than reusing `dashboard.view`**, since Receptionist needs to see departments but
   `dashboard.view` is already granted to every hotel role for a different purpose (the
   dashboard itself) — conflating them would make it impossible to ever grant one without
   the other later. `hotel_settings.read`/`hotels.read`/`hotels.update` from the milestone
   brief's suggested list were **not** added — `hotel.settings.manage` (M1) already covers
   both read and write of the settings page for its only audience (GM/Owner), and
   `hotels_select_member_or_platform` (M1 RLS) already covers general row visibility for
   the dashboard. See `rbac.md`'s Milestone 2 section for the full reasoning.
4. **Business hours/holidays *manage* is restricted to GM/Owner**, not also granted to
   Reception Manager, even though departments *manage* is granted to Reception Manager.
   Rationale: business hours/holidays are hotel-wide configuration that will directly drive
   future AI scheduling/handoff behavior (higher blast radius if misconfigured), matching
   the existing bar set for `hotel.settings.manage`, whereas departments are a lower-stakes
   operational list. Revisit if this proves too restrictive once real hotels are managing
   their own hours.
5. **`hotel_business_hours`/`hotel_holidays` are a foundation, not a scheduling engine.**
   `effective_from`/`effective_to` columns exist but nothing resolves "what are today's
   actual hours" from them yet — that logic is deferred to M3 (AI Agent Configuration),
   which is the first milestone that actually needs to answer that question. No
   overnight-spanning hours (open before midnight, close after) are supported yet.
6. **Holidays support create + delete, not in-place edit.** Departments and hotel settings
   both support full edit; holidays are typically one-off calendar entries where
   delete-and-recreate is just as fast as an edit form, so the extra UI wasn't built. Add an
   edit action later if this proves annoying in practice.
7. **`membership_departments` derives `organization_id`/`hotel_id` via a `BEFORE INSERT`
   trigger** rather than trusting the caller — see `erd.md`'s Milestone 2 notes. This also
   rejects assigning an org-wide membership (no `hotel_id`) to a department, or assigning a
   membership to a department belonging to a different hotel, at the database layer.
8. **Team & Roles' M1 gap (hotel-scoped access for Hotel GM) was not closed in M2** — the
   department-assignment UI was added to the existing org-scoped `/o/[orgSlug]/team` page
   rather than building the hotel-scoped page first. Still flagged as a fast-follow, now
   doubly relevant since department assignment has the same gap.
9. **Roadmap renumbered**: M2 was originally scoped as "Hotel Dashboard & Org Dashboard
   shells." This milestone absorbed the per-hotel dashboard part of that (now real data, no
   longer a shell) and was redirected by you to also cover Supabase activation and hotel
   operations (profile/departments/schedule). The org-level multi-hotel rollup dashboard
   was not built and needs a home in a future milestone. Subsequent milestones were shifted
   down by one and the former separate "KB/RAG foundation" (M3) and "AI Agents
   configuration" (M5) milestones were merged into one M3 per your explicit direction for
   the next milestone. See `roadmap.md`.
10. **Docker Desktop was available but not running**, and `C:` was still essentially full
    (142MB free) during this session — starting it to spin up a local Supabase stack for
    real migration testing was judged too risky (Docker's VM disk typically lives on `C:`
    on Windows) and not what you asked for (you anticipated no live project and asked for
    exact activation commands instead — see below). Migrations were verified by careful
    manual review and a clean `next build`/`tsc --noEmit`/`eslint .` pass plus a dev-server
    smoke test of every new route (all correctly redirect unauthenticated requests to
    `/login`, no runtime errors in the server log), not by executing them.

## Decisions made while implementing M3 (2026-07-25)

1. **Capability definitions live in code, not a database table.** The brief asked for "a
   reusable capability registry rather than hardcoding feature checks" — read as a shared
   constant (`lib/agentCapabilities.ts`) used by every capability-related page and
   validation path, not necessarily a DB reference table. `ai_agent_capabilities` only
   stores what varies per agent (enabled, an approval-requirement override); a `CHECK`
   constraint keeps the two in sync. Revisit if capability definitions ever need to be
   hotel-customizable rather than platform-defined.
2. **"Agent needs ≥1 enabled language" and "default language must be enabled" are
   application-enforced, not DB-enforced** — the same category of simplification as
   several M1/M2 invariants. Both are cross-row (or cross-table) checks that would need a
   deferred constraint trigger to validate correctly across a multi-statement update; that
   trigger is real complexity not worth the risk without a live database to test it
   against. The create/edit server actions validate the full submitted set with Zod before
   writing.
3. **Schedule-mode settings (`use_hotel_business_hours`, `holiday_behavior`,
   `outside_hours_behavior`) live directly on `ai_agents`**, not a separate 1-row
   settings table, since they're inherently scalar per-agent properties — adding 3 columns
   to an already-wide table beat inventing a trivial 1:1 table. The actual override day/shift
   rows still get their own table (`ai_agent_schedules`), mirroring `hotel_business_hours`.
4. **Prompt versions are immutable and append-only**, including restores — restoring
   version 3 when you're on version 7 creates version 8 with version 3's content, rather
   than deleting versions 4–7 or reactivating version 3 in place. History is never lost or
   reordered. `ai_agents.current_prompt_version` is a plain integer, not a foreign key, to
   avoid a circular reference between `ai_agents` and `ai_agent_prompt_versions`.
5. **Platform-protected safety rules are a code constant** (`lib/agentPromptPolicy.ts`),
   never a database row alongside the hotel-editable prompt fields — this guarantees no
   hotel configuration path can ever weaken or remove them, since they're not reachable
   from any UPDATE statement in the first place.
6. **The RLS UPDATE policy on `ai_agents` admits any of `update`/`activate`/`archive`**
   rather than three separate narrower policies, since all three write to the same table
   via the same `UPDATE` statement type. The precise distinction (a Reception Managers
   Manager can deactivate but not archive) is enforced by which server action they can
   reach — each calls `requirePermission()` with its own specific permission before
   touching the database at all. Same pattern for the two ways of inserting a
   `ai_agent_prompt_versions` row (editing vs. restoring).
7. **The Test Playground's "would this need approval/handoff" logic is a simple keyword
   heuristic** (`lib/agentTestSimulation.ts`), not real intent detection — matching the
   requirement that M3 must not call any AI provider. It's clearly a simulation, and the
   page is labeled accordingly; don't mistake its output for what a real AI agent would
   actually decide once M8 (voice) exists.
8. **Creating an agent seeds 24 rows in one server action** (the agent, its default
   language, all 19 capabilities from the registry, one handoff-rules row, one
   approval-policy row, and prompt version 1) rather than lazily creating child rows the
   first time each tab is opened. This keeps every tab immediately editable after creation
   instead of needing "create if missing" branches scattered across 6 different pages.
9. **Roadmap renumbered again**: this milestone's own brief explicitly named the next
   milestone "Knowledge Base Foundation," which the prior version of `roadmap.md` had
   pencilled in as M4 = "Omnichannel Inbox skeleton." Knowledge Base is now M4 and
   everything after it shifted down by one (Inbox is now M5, Reservations & PMS M6, Booking
   Engine M7, Voice M8, Integrations M9, Billing M10). See `roadmap.md`.

## Decisions made while implementing M4 (2026-07-26)

1. **Knowledge is split into categories + articles + documents, not one polymorphic "content"
   table.** Articles (hand-authored text) and documents (file/URL) have genuinely different
   columns and lifecycles; a shared table would be mostly-null either way. Categories are a
   thin grouping with `on delete set null` back-references so removing a category never deletes
   content.
2. **`processing_status` ships as a foundation, deliberately inert.** M4 has no ingestion
   pipeline, so `processing`/`failed` are never written; a successful upload goes straight to
   `ready`, which is documented everywhere to mean "stored and available as a raw source," not
   "vector-indexed/retrievable." This keeps the honest-no-fake-functionality rule while giving
   the future RAG milestone a status column to grow into. Chunk/embedding tables (pgvector)
   are explicitly out of scope (see `erd.md` future entities).
3. **Real Storage upload was built (M4 is the milestone where Storage lands).** Unlike the M2
   logo/cover fields (deferred to plain URLs), documents use a private `kb-documents` bucket
   with `storage.objects` RLS keyed off the `hotel_id` path segment, a 25 MB limit, and a
   MIME allow-list — enforced both at the bucket and re-validated in the upload action.
   Downloads use short-lived signed URLs. The bucket + policies are created **in a migration**
   (`storage.buckets` insert + `create policy on storage.objects`), which applied cleanly on
   the live project as the `postgres` role — no "must be owner" issue materialized.
4. **The KB enable/disable toggle is gated by `ai_agents.update`, source assignment by
   `ai_agents.manage_knowledge`.** The toggle writes the `ai_agents` row (whose UPDATE RLS
   admits update/activate/archive); assignments write `ai_agent_knowledge_sources` (its own
   RLS). Every role with `manage_knowledge` also has `update`, so the split never strands a
   user. See `rbac.md`'s Milestone 4 notes.
5. **`lib/supabase/types.ts` was hand-extended with the 4 KB tables** (codegen still blocked on
   Docker/disk — see the activation notes). KB enum columns are typed as `string` there, with
   the narrow unions in `lib/knowledgeBase.ts`, matching the M3 `capability_key` precedent so
   the file stays codegen-replaceable.
6. **`ai_agents.manage_knowledge` sits in the `ai_agents` module, not `knowledge_base`** —
   assigning knowledge is agent configuration. The three `kb.*.manage` permissions are kept
   separate from each other (not one `kb.manage`) so a hotel could, later, let someone manage
   FAQ articles without also granting document uploads.
7. **Roadmap not renumbered this time** — M4 was already "Knowledge Base Foundation" after the
   M3-era renumber, so M5–M10 are unchanged (Inbox, PMS, Booking, Voice, Integrations, Billing).

## Decisions made while implementing M5 (2026-07-27)

1. **Provider integrations are stubbed behind a code interface, not faked in the data.** Every
   channel's `provider` is `'stub'` and `getChannelAdapter()` always returns a
   `StubChannelAdapter` whose `send()` stores the message and transmits nothing. This keeps
   the no-fake-functionality rule honest (the UI says so everywhere) while giving later
   milestones a single seam to add real email/SMS/WhatsApp/Viber/voice adapters.
2. **No inbound message path exists.** Inbound messages arrive from providers/webhooks, which
   don't exist yet, so the skeleton only supports staff-composed/outbound messages. The
   `direction`/`sender_type='guest'` columns exist so inbound slots in later without a schema
   change.
3. **`inbox.view` is withheld from Platform Moderator** (`platform_moderator_can_read = false`)
   — the first read permission in the project not given to moderators, because conversations
   carry guest PII. Platform Admin/Superadmin still see everything via the platform bypass.
4. **`conversations` UPDATE RLS admits `inbox.send` OR `inbox.manage`** (both write the row —
   send updates `last_message_*`, manage changes status/assignment), with each server action
   checking its precise permission first. Same multi-permission-policy pattern as M3's
   `ai_agents` UPDATE.
5. **Messages are immutable** (insert + select only, no update/delete RLS) — a conversation is
   an append-only log in the skeleton. `delivery_status` defaults to `sent` and never changes
   without a provider that reports delivery.
6. **The template's Chatbot page was not ported verbatim.** It lives only in the un-extracted
   React zip; the thread UI is built fresh on the existing Spico SCSS design system (new
   `.spico-thread`/`.spico-msg-*` classes) rather than extracting and adapting the old markup.
7. **`channels.config` (jsonb) is an intentional empty placeholder** for future provider
   credentials/settings — nothing reads or writes it in M5.

### Onboarding bug found & fixed once the app ran live (2026-07-27)

Creating the **first** organization failed with *"new row violates row-level security policy
for table organizations."* Root cause: `organizations/new/actions.ts` did `.insert().select()`,
but the creator is not yet a member of the org, so the `organizations` SELECT policy forbids
reading the row back — and `INSERT ... RETURNING` (which `.select()` triggers) then raises the
RLS error even though the INSERT's `WITH CHECK (true)` passed. This was invisible until M1's
migrations were finally executed against a live DB *and* the flow was run by a real logged-in
user (prior smoke tests only checked unauthenticated redirects). Fix: generate the org id with
`randomUUID()` and insert **without** `.select()`; the bootstrap membership inserted immediately
after is what makes the org visible. Only organization creation had this gap — hotel creation is
done by an org-scoped owner who *can* read the new hotel back, so its `.insert().select()` is fine.

## Decisions made while implementing M6 (2026-07-28)

1. **Availability is computed, not stored.** No per-night inventory table (`room_type_inventory`
   or similar); availability = active in-service rooms of a type minus overlapping
   occupying reservations (`pending`/`confirmed`/`checked_in`), computed at booking and
   check-in time. Simpler and correct for a foundation; a stored/cached inventory calendar is a
   later optimization if performance or overbooking policy needs it.
2. **No DB exclusion constraint prevents overlapping room assignment.** A btree_gist exclusion
   constraint on `(room_id, daterange)` would be the rigorous guard, but it needs the extension
   and careful handling of the nullable `room_id`; instead the check-in action verifies the room
   is free (app-enforced, same category as other M3–M5 cross-row invariants). Revisit if
   concurrent check-ins ever race in practice.
3. **A reservation is for a room TYPE; a specific room is assigned at check-in.** `room_id` is
   nullable until then. This matches how hotels actually operate (guests book a category, the
   front desk assigns a physical room on arrival) and keeps availability at the type level.
4. **Reservation lifecycle is a status enum with app-guarded transitions**
   (`pending`→`confirmed`→`checked_in`→`checked_out`, plus `cancelled`/`no_show`), not a state
   machine table. Each server action checks the current status before transitioning; check-out
   also flips the assigned room's housekeeping status to `dirty`.
5. **Guests are hotel-scoped with no cross-hotel identity resolution.** A guest record belongs to
   the hotel that created it; deduping a returning guest across hotels/stays is out of scope for
   M6 (would need a guest-profile-merge feature).
6. **Rate plans are a flat nightly amount per room type.** No seasonal / day-of-week /
   length-of-stay pricing calendar — a reservation's total is `nights × (rate plan or room-type
   base rate)`. A pricing-calendar engine is deferred.
7. **`guests.read`/`reservations.read` are withheld from Platform Moderator** (PII), consistent
   with M5's `inbox.view`. `pms.read` (room inventory config, not PII) keeps the moderator read
   grant.
8. **Scope of M6 was deliberately limited to the operational core.** Housekeeping workflow,
   folio/billing/payments, channel-manager sync, and the public booking engine (M7) are separate;
   M6 is the internal PMS + reservations foundation the booking engine and voice agents will read.

## Decisions made while implementing M7 (2026-07-29)

1. **The public booking surface is RPC-only — anon never touches base tables.** Four
   `SECURITY DEFINER` functions (`booking_hotel_public`, `booking_room_type_offers`,
   `booking_rate_plans_public`, `booking_create`) with EXECUTE granted to `anon` are the entire
   public API. No anon SELECT/INSERT policies were added to `room_types`/`rooms`/`rate_plans`/
   `reservations`/`guests` — so a guest can never read another guest's reservation/PII, only the
   derived values the functions return (availability count, "from" price, a confirmation code).
   All functions set a locked `search_path = public`.
2. **`booking_create` re-validates everything server-side inside the function** (hotel enabled,
   dates, min/max nights, occupancy, and a fresh availability re-count) before inserting. The
   client-side/RPC availability read is advisory; the write-time check inside the definer
   function is the authoritative overbooking guard. It creates a guest + a `pending` reservation
   with `source = 'booking_engine'`.
3. **Public bookings land as `pending`, not `confirmed`.** There's no payment or identity
   verification, so a public request is exactly that — a request — until staff confirm it in the
   internal Reservations screen (reusing M6's `pending → confirmed` lifecycle). No fake
   "instant confirmation."
4. **Middleware was split into auth pages vs. truly-public prefixes.** `AUTH_PATHS`
   (`/login`,`/register`,`/reset-password`) bounce logged-in users home; `PUBLIC_PREFIXES`
   (`/book`) are reachable by anyone and never redirected. Everything else still requires a
   session. The guest flow lives in a new `app/(public)` route group with a bare shell (no
   dashboard chrome).
5. **`booking.manage` is one permission for the internal config screen** (enable, stay limits,
   terms), at the GM/Owner + Reception Managers Manager tier (same bar as `pms.manage`). The
   public flow needs no permission at all. `platform_moderator_can_read = true` since booking
   config is not guest PII.
6. **Out of scope for the foundation:** payment/deposit capture (bookings are unpaid), rate
   limiting / CAPTCHA on the public RPCs (a real anti-abuse concern before production), a
   guest-facing lookup/cancel page, and "held" inventory (carts). Availability is a live
   point-in-time count, so two guests could in theory both pass the read check and race at
   write time — the write-time re-count means at most one succeeds when only one room is left,
   but the loser sees an error rather than a nicer "just taken" flow.

## Decisions made while implementing M8 (2026-07-30)

1. **`voice-service/` is genuinely independent of the Next.js app — no cross-imports, not even
   type-only ones.** It has its own `package.json`/`node_modules`/`tsconfig.json`/`.env.example`
   and is excluded from the main app's `tsconfig.json`/`eslint.config.mjs`. The only coupling is
   the shared live Supabase project (both hold the same `SUPABASE_URL`/service-role key in their
   own env files) and duplicated *shapes* — `voice-service/src/decision.ts` deliberately mirrors
   (not imports) the keyword-heuristic approach of the main app's `lib/agentTestSimulation.ts`,
   scoped down to just what a call needs. Rationale: the two are meant to deploy independently
   (Vercel vs. a persistent host) with independent release cycles, and `lib/supabase/types.ts` is
   itself hand-written/unstable (codegen still deferred) — sharing it across a package boundary
   would just propagate that instability into a service with a different deploy cadence.
2. **Every provider integration is a stub, same pattern as M5's `ChannelAdapter`.**
   `StubTelnyxAdapter`/`StubRealtimeAdapter` make zero network calls; each method returns a note
   string describing what a live call would do. `voice-service/README.md` lists the exact steps
   to replace them once Telnyx/OpenAI credentials exist.
3. **The "simulate inbound call" path is the one thing that's real.** `POST /calls/simulate`
   (guarded by a shared-secret bearer token, since it's a test harness reachable by anyone who
   can reach the service) resolves a hotel's `hotel_voice_settings.default_agent_id`, loads that
   agent's real M3 language/handoff configuration, computes a disposition, and writes actual
   `calls`/`call_events` rows to the live database. This is the concrete M3 → M8 connection the
   roadmap asked for — even though the "call" itself is synthetic.
4. **`POST /webhooks/telnyx` only acknowledges, it does not process.** Wiring a real Telnyx
   webhook to actual call-handling logic (and verifying its signature with `TELNYX_PUBLIC_KEY`)
   is listed as unfinished work in the README rather than half-built here — a real webhook
   payload's shape isn't something to guess at without a live Telnyx account to test against.
5. **`calls.conversation_id` and the whole `call_recordings` table are unpopulated foundation
   columns**, same "ship the column, not the capability" pattern as M2's business-hours
   `effective_from`/`effective_to` and M6's stored-inventory deferral. No Storage bucket was
   created for recordings (that's real scope — bucket, RLS, and something that actually uploads
   audio — deferred until live call recording exists). No conversation/message is auto-created
   from a call (that would mean writing to M5's tables from a stub call, which risks looking
   like a real transcript when none exists); the column exists so that link can be added later
   without a schema change.
6. **`voice.manage` follows the `booking.manage`/`pms.read` precedent (moderator-readable),
   `calls.read`/`calls.manage` follow the `inbox.view`/`guests.read` precedent (withheld from
   Platform Moderator)** — voice configuration isn't PII, call metadata (phone numbers) is.
7. **A patched `ws` version was pinned deliberately.** The first `npm install` in `voice-service`
   resolved `ws@8.18.3`, which `npm audit` flagged with two disclosed advisories (uninitialized
   memory disclosure, memory-exhaustion DoS) affecting `8.0.0–8.20.1`. Bumped to `8.21.1` and
   re-verified `npm audit` reports 0 vulnerabilities before treating the service as done.
8. **No end-to-end success run of `/calls/simulate` happened this session** — the user's org has
   no hotel yet, so there's no `hotel_voice_settings`/agent to resolve. What was verified instead:
   auth (401 without/with wrong secret), input validation (400 without `hotelSlug`), and a real
   Supabase round-trip returning a clean "Hotel not found" error rather than a crash or a
   connection failure. Once a hotel + active AI agent exist, enable voice under **Calls → Voice
   Settings** and follow `voice-service/README.md`'s curl example for a full success run.

## Decisions made while implementing M9 (2026-07-31)

1. **The Open API authenticates itself — it is NOT part of the Supabase-session auth model.**
   `app/api/v1/*` Route Handlers resolve identity from `Authorization: Bearer <api key>` against
   `api_keys.key_hash` using `lib/supabase/admin.ts` (the first service-role client in the main
   Next.js app — `voice-service` already had its own, separate one). This required a real fix,
   not just new code: the existing middleware (`lib/supabase/middleware.ts`) ran `getUser()` and
   redirected every unauthenticated request to `/login` — including API calls, which have no
   Supabase session cookie at all and would otherwise get an HTML redirect instead of a JSON 401.
   Added a `NO_SESSION_PREFIXES = ["/api"]` early-return, skipping the Supabase session logic
   entirely (not just the redirect) for `/api/*`, since there is no session to refresh there.
2. **API keys are hashed (SHA-256, bearer-token pattern); webhook secrets are stored
   retrievably.** These are deliberately different, not inconsistent: an API key's plaintext
   IS the credential (possession proves identity to us, so we must not be able to recover it —
   same as GitHub/Stripe tokens), while a webhook secret must be reused by us on every delivery
   to compute the HMAC signature the subscriber verifies against, which is impossible if only a
   hash is stored. The webhook secret is shown in the dashboard (gated by `webhooks.manage`)
   because the integration partner needs it to verify signatures — that's correct practice
   (mirrors how Stripe's webhook signing secret works), not an oversight.
3. **Webhook delivery is synchronous and inline with the triggering request** (bounded to 3
   attempts, ~1s of backoff total, a 5s timeout per attempt) — not queue-backed. A delivery that
   exhausts its attempts is marked `failed` in `webhook_deliveries` and nothing retries it later.
   Building a real durable queue (Upstash-backed job queue, or a worker analogous to
   `voice-service`) was judged out of scope for a foundation milestone; the delivery log/
   idempotency-key model is designed so a queue-backed retry mechanism could be added later
   without a schema change — it would just re-attempt `status = 'failed'` rows.
   `emitWebhookEvent()` never throws — a subscriber being down or slow must not fail the
   reservation/booking action that triggered it.
4. **Rate limiting and request idempotency are both real *when Upstash is configured*, and
   openly inert when it isn't** (`lib/rateLimit.ts`, plain `fetch` against Upstash's REST API —
   deliberately not the `@upstash/redis` SDK, to avoid a dependency for two HTTP calls). Every
   `/api/v1/*` response carries `X-RateLimit-Configured` so a caller (or an operator debugging
   production) can see the truth rather than assume protection exists. Both fail OPEN on any
   Upstash error (network issue, outage) — availability of the API takes priority over strict
   rate-limit enforcement for a foundation feature; revisit if abuse becomes a real concern.
5. **`writeAuditLog()` was extended, not replaced**, to accept an optional Supabase client
   parameter (defaulting to the existing session-scoped client) and to accept `actorProfileId:
   null` — needed because API-route-triggered writes have no logged-in user (`actor_type:
   'system'`, per the existing `audit_log` CHECK constraint, which already allowed a null actor
   profile for `'ai'`/`'system'`). This is a backward-compatible signature change — every
   existing call site continues to work unmodified.
6. **The Open API surface is 2 endpoints** (`GET /availability`, `POST /reservations`), not a
   full REST API — enough to prove the auth/scope/rate-limit/idempotency pattern end-to-end
   without an unbounded surface. More endpoints (e.g. reservation lookup, guest lookup) follow
   the identical `authenticateApiRequest()` pattern and are straightforward additions later.
7. **An API key is always scoped to exactly one hotel** (`api_keys.hotel_id`), with no
   parameter allowing a request to target a different hotel — the narrowest security model for
   a third-party integration credential. An org-wide key (for a channel manager covering
   multiple hotels) would need a deliberate future extension, not assumed here.
8. **Connectors (PMS/CRM/calendar/channel-manager) remain a pure stub**, same pattern as M5's
   channels and M8's calls/voice — `testConnectorConnection()` always reports not connected, no
   vendor SDK or OAuth flow exists. This is real scope (each vendor is its own integration
   project), correctly deferred rather than half-built.
9. **No end-to-end success run of the Open API happened this session.** The user's organization
   now has one hotel (`slug: test`), but it's still in `onboarding` status — `POST
   /api/v1/reservations`/`GET /api/v1/availability` both require an `active` hotel by design (an
   onboarding hotel has no real inventory to sell). No API key or test reservation was written
   into the live tenant to force a path around that, consistent with the auto-mode boundary from
   M6/M8 (schema `db push` is fine; writing data into the user's tenant is not). What was
   verified instead: auth failure paths (missing header → 401, malformed/unknown key → 401 via a
   real DB query, not a stub), and that the middleware fix actually works (API routes return
   JSON, not an HTML redirect). Once the hotel is activated and an API key is created via the
   dashboard, both endpoints are ready to exercise for real.

## Decisions made while implementing M10 (2026-08-01)

1. **Billing is organization-scoped, not hotel-scoped** — a subscription belongs to the
   organization (`organization_subscriptions.organization_id UNIQUE`), matching how a real
   multi-hotel group is billed once, not per-property. `billing.read`/`billing.manage` follow the
   existing org-scoped permission model (like `team.view`/`team.manage`), not the hotel-scoped one
   most other M2–M9 permissions use.
2. **`billing.manage` is Hotel Owner ONLY — the first hotel-wide-config permission in the project
   withheld from Hotel General Manager.** Every prior "hotel-wide configuration" permission
   (`pms.manage`, `voice.manage`, `booking.manage`, `api_keys.manage`, etc.) was granted at
   Reception-Managers-Manager-or-GM-and-up; billing is stricter because a plan change has direct
   financial consequences, which real SaaS products near-universally reserve for the account
   owner specifically, not general management.
3. **Plan catalog writes are superadmin-only** — stricter even than the admin+superadmin tier
   used for org suspend and platform settings. Reasoning: a pricing/limit change to the `plans`
   table affects every organization on the platform simultaneously, the single highest blast
   radius of any write added across all ten milestones. Reading the catalog is open to any
   authenticated user (`to authenticated using (true)`) since every org needs to see it to choose
   a plan — matching how a public pricing page works, no `has_permission()` check involved at all
   for reads.
4. **Every organization is auto-enrolled on `starter`/`trialing`** via an `AFTER INSERT` trigger
   on `organizations` (`seed_default_subscription()`), the same "seed on creation" pattern as
   M2's departments and M3's agent child rows. Because this milestone was added after M1–M9 (and
   real organizations already existed), a **backfill migration**
   (`20260801180006_backfill_organization_subscriptions.sql`) was needed to give pre-existing
   organizations the same default state — an `INSERT ... WHERE NOT EXISTS`, idempotent and safe
   to re-run, applied to the live project rather than left as a gap.
5. **Payment processing is a stub** (`lib/billing.ts`'s `processStubPayment()`), same pattern as
   every other external integration in this project (Telnyx/OpenAI in M8, PMS/CRM/channel-manager
   connectors in M9). Plan changes are immediate, unpaid database updates — genuinely different
   from a real checkout flow, and labeled as such everywhere the UI mentions it, not silently
   implied to be a real purchase.
6. **Platform Moderator's first genuinely actionable capability**: raising a moderation flag
   against an organization or hotel (`platform_moderation_flags`, insert-only for Moderator,
   resolve is admin/superadmin-only). Every prior Moderator grant was `platform_moderator_can_read
   = true` on read-only permissions — this is the first write path Moderator has anywhere in the
   system, deliberately narrow (create a flag, nothing more; cannot resolve it or take the actual
   suspend action, which stays admin+superadmin-only, unchanged from M1).
7. **`platform_moderation_flags.target_id` is not a database foreign key** — it can reference
   either `organizations.id` or `hotels.id` depending on `target_type`, and Postgres has no clean
   single-column FK for a polymorphic reference without a lookup table this milestone didn't
   introduce. Existence is validated in the server action instead (queries the right table based
   on `target_type` before inserting) — the same category of app-enforced cross-table check used
   throughout M3–M9 (e.g. M7's agent-knowledge-source targets, M9's rate-plan/room-type match).
8. **`maintenance_mode`/`announcement_message` on `platform_settings` are stored but read by no
   page** — no maintenance-mode gate and no announcement banner exist yet. Shipping the config
   column ahead of the UI that consumes it is the same pattern as several M2/M6/M8 columns
   (e.g. `call_recordings.storage_path`); the settings page itself says so explicitly rather than
   implying the toggle does something it doesn't.
9. **Plan limits (`max_hotels`/`max_users`) are not enforced anywhere.** They're stored on the
   `plans` catalog and shown in the admin UI, but no code path checks them before allowing a new
   hotel or team member to be created — an org on Starter (1 hotel, 5 users) can still create
   unlimited hotels today. Enforcing this would mean threading a plan-limit check into M1's
   hotel-creation action and M1's invite/membership-creation action; flagged as real follow-up
   work rather than attempted as a rushed addition to two already-shipped, tested milestones.

## Decisions made while implementing M11 (2026-08-02)

1. **A real security vulnerability was found and fixed live during this milestone — not a
   theoretical concern, a verified live exploit path.** `create_reservation_folio(uuid)` is
   `SECURITY DEFINER` (needed so it can write `folios`/`folio_line_items` regardless of the
   caller's own `folio.manage` standing — the same reasoning as every other cross-cutting
   `SECURITY DEFINER` function in this project). Its migration granted `EXECUTE` explicitly to
   `authenticated` only, deliberately omitting `anon`, reasoning that "no explicit grant = no
   access." **That reasoning was wrong for two independent reasons, both discovered by directly
   testing the deployed function with an anon key rather than assuming the grant was correct:**
   - PostgreSQL grants `EXECUTE` on newly created functions to the `PUBLIC` pseudo-role by
     default (unlike tables, which grant nothing to `PUBLIC`/`anon` by default). A first fix
     migration (`20260802190010`) revoked `EXECUTE ... FROM PUBLIC` — verified via a second live
     anon call, and the function was **still** callable.
   - Supabase separately provisions the `anon` and `authenticated` roles with their own direct
     `EXECUTE` grants on the `public` schema at project setup (via `ALTER DEFAULT PRIVILEGES`),
     independent of `PUBLIC`. A second fix migration (`20260802190011`) revoked `EXECUTE`
     explicitly `FROM anon` (and re-affirmed `FROM`/`TO authenticated` explicitly rather than
     relying on whichever prior grant happened to still apply) — verified via a third round of
     live calls: anon now gets `42501 permission denied`, `authenticated` still works (via the
     explicit grant), and `booking_create` (intentionally anon-executable, calling
     `create_reservation_folio` internally) still succeeds, because a nested call from within a
     `SECURITY DEFINER` function executes as that function's OWNER — not the original caller —
     so revoking `anon`'s own grant does not affect that path at all.
   - **Practical impact of the window this was live**: an anonymous caller who knew (or
     enumerated) a reservation UUID could have called `POST /rest/v1/rpc/create_reservation_folio`
     directly and created a folio + per-night charge line items for that reservation, bypassing
     `folio.manage` RLS entirely (the function is `SECURITY DEFINER`, so RLS never runs for its
     writes). `reservation_nightly_total`/`rate_plan_nightly_rate` had the same gap but are
     read-only/non-sensitive (computed pricing, no PII, no write) — tightened for consistency,
     not because they were independently dangerous.
   - **Standing rule for any future `SECURITY DEFINER` function in this project**: after writing
     `grant execute ... to <role>`, explicitly test with an anon (or lower-privilege) key against
     the live project before considering the function's access boundary correct. Omitting a grant
     is not sufficient — PostgreSQL and Supabase both have default-open behavior for function
     execution that tables do not have. Consider adding an explicit `revoke execute ... from
     public, anon` line as a matter of course for every new `SECURITY DEFINER` function that
     performs a write, rather than relying on omission.
2. **One shared SQL function prices every reservation-creation path.** `reservation_nightly_total`
   (which resolves per-night seasonal overrides via `rate_plan_nightly_rate`) is called from M6's
   internal action, M9's Open API route, and M7's `booking_create` RPC (replaced in place via
   `create or replace function` with an identical signature, preserving its existing `anon`
   grant). Without this, seasonal pricing would have needed three independent, easily-divergent
   reimplementations — the same reasoning that produced `create_reservation_folio` as one shared
   function rather than three copies of "insert a folio + per-night lines."
3. **Seasonal rate overlap is resolved deterministically, not prevented.** If two
   `rate_plan_seasons` rows for the same plan cover the same night, the shortest (most specific)
   date range wins, tie-broken by earliest `created_at`. A real overlap-prevention constraint
   would need a `btree_gist` exclusion constraint per `rate_plan_id`; judged unnecessary
   complexity for a foundation feature — a hotel operator creating overlapping seasons is a data
   entry mistake to catch in the UI later, not a correctness property the schema must enforce.
4. **Folios are strictly 1:1 with a reservation** (`folios.reservation_id` `unique`, `not null`).
   A free-standing/incidental folio (e.g. a walk-in with no reservation, or a shared folio across
   multiple reservations) is out of scope — flagged as a real limitation, not attempted, since it
   would mean loosening the schema's core invariant without a concrete need driving the design.
5. **Channel-manager sync assembles genuinely real data and logs it — the only thing it doesn't
   do is transmit it.** `push_rates`/`push_availability` query this hotel's actual room types,
   rate plans (including today's seasonally-resolved rate via `rate_plan_nightly_rate`), rooms,
   and reservations; `pull_reservations` summarizes real reservations from the last 30 days. This
   is a stronger foundation than a pure UI mockup would be — the exact same query logic a real
   connector would need to build its outbound payload already exists and is exercised, just
   without a live OTA endpoint to send it to.
6. **Housekeeping tasks are created in application code (`checkOutReservationAction`), not a DB
   trigger** — consistent with that same action already setting `rooms.housekeeping_status =
   'dirty'` in app code rather than via a trigger. Keeping both side effects in the same
   application-code location (rather than splitting behavior between a Next.js action and a
   Postgres trigger) was judged more maintainable and easier to reason about together.
7. **Verifying a `checkout_clean` task clears the room back to `clean`.** This is the one place
   M11 writes back to M6's `rooms.housekeeping_status` — completing the workflow loop the M6
   comment ("mark the room dirty for housekeeping on departure") implicitly promised but never
   closed.
8. **No end-to-end success run of the folio/pricing/sync flows happened this session** — the
   user's one hotel has no room types or rate plans yet, so there's no way to create a real
   reservation to generate a real folio, and no rate plan to attach a season to. What was verified
   instead: the SQL functions' fallback/error-handling behavior via direct RPC calls with
   synthetic/nonexistent ids (see the "After M11" verification note above), and the full
   auth/route-protection surface. Once room types + rate plans exist, creating a reservation will
   exercise the whole folio + seasonal-pricing path for real.

## Decisions made while implementing M12 (2026-08-03)

1. **`has_permission()`'s universal admin+superadmin bypass meant the test-data seeding tool
   could not use the standard `requirePermission()` path.** The brief requires Hotel Owner +
   Platform Superadmin ONLY, excluding Platform Admin — the first feature in the project that
   must deliberately narrow that bypass. Solved with a hand-rolled `requireOwnerOrSuperadmin()`
   (`lib/demoData.ts`) instead of a more invasive change to `has_permission()` itself (which
   would have affected every existing permission check's behavior for the sake of one
   feature). The underlying `seed_hotel_test_data()`/`remove_hotel_test_data()` SQL functions
   independently re-check the same condition inside the function body
   (`assert_hotel_owner_or_superadmin()`), since `EXECUTE` is granted to `authenticated`
   generally and any logged-in user could otherwise invoke the RPC directly. See
   `docs/rbac.md`'s Milestone 12 section for the full reasoning — do not copy this pattern for
   a normal permission without re-reading it first.
2. **Invitation acceptance was built, though not explicitly enumerated in the milestone
   brief's checklist wording.** `invitations`' own table comment since M1 always said
   "accepted via a server action that creates the membership row," but that action was never
   built in M1-M11 — invitations could be created but never accepted, no path converted one
   into a membership. Building the minimal `accept_invitation()` SECURITY DEFINER function +
   `/invite/[token]` route was judged necessary to make the onboarding checklist's "invite
   team members" step meaningfully real, and is bounded in scope (one SQL function, one new
   route, one link surfaced on the Team page) — not a scope-creep new feature. It also
   re-checks the organization's plan `max_users` limit at accept time (not just invite time),
   failing closed if the org has no subscription row at all (every org is auto-seeded one on
   creation, so a missing row is treated as an anomaly, not "unlimited").
3. **Voice-service health reporting on `/admin/system-health` stays DB-derived only —
   deliberately not a live HTTP call to `voice-service`.** M8 explicitly decoupled the two
   services (`.env.example`'s M8 section states the main app never reads
   `TELNYX_*`/`OPENAI_API_KEY`/`VOICE_SERVICE_*`, only the tables `voice-service` writes to).
   Introducing a `VOICE_SERVICE_URL` so the dashboard could poll its `/health` endpoint would
   silently reverse that decision. Instead the health page reports "Stub mode" plus a
   DB-derived count of hotels with voice enabled and the most recent `calls` row timestamp — an
   honest, zero-new-coupling signal.
4. **Plan-limit "active hotel" count includes `onboarding` hotels, not just `active` ones.**
   Counting only `active` hotels against `max_hotels` would let an organization create
   unlimited `onboarding` hotels that never activate as a way around the limit — `checkHotelCreationAllowed()`
   (`lib/planLimits.ts`) counts everything except `suspended`.
5. **A missing `organization_subscriptions` row fails CLOSED, not open, everywhere it's
   checked** (`lib/planLimits.ts`, and again inside `accept_invitation()` for the
   accept-time re-check) — every organization is auto-seeded a `starter`/`trialing`
   subscription on creation via M10's `seed_default_subscription()` trigger, so a missing row
   is itself an anomaly worth surfacing as an error, never a normal "unlimited" state to
   silently allow through.
6. **`timezone_configured` is a readiness check that can never actually fail** —
   `hotels.timezone` is `NOT NULL DEFAULT 'UTC'` at the DB level, so every hotel already
   "passes" this check even if nobody reviewed it. Flagged to the user during planning and
   accepted as a known, documented limitation (`docs/security-followups.md`) rather than adding
   a separate "reviewed" flag that nothing else in the schema has a precedent for.
7. **Supabase types codegen re-investigated, not just repeated from M1's finding.** `C:` now
   has 3.42 GB free (vs. 0 bytes during M1/M11) and Docker Desktop is still not running, but
   `supabase gen types typescript --db-url "<pooler-uri>"` and `--project-id <ref>` (after
   `supabase login`) are both non-Docker paths on the installed CLI (2.109.1), verified via
   `--help` this session. Neither was run live this session — no DB password was available in
   this environment to supply to `--db-url`, and no personal access token was available for
   `supabase login`. Documented as the concrete next step rather than repeating "blocked on
   Docker" — whoever runs this should try the `--db-url` command for real (generating to a
   `.new` file first, never overwriting `lib/supabase/types.ts` directly, and manually
   re-merging the hand-written domain unions `PermissionKey`/`RoleKey`/`PlatformRole`/
   `AuditActorType` that codegen won't reproduce) before falling back to "still blocked."
   `lib/supabase/types.ts` was hand-extended this session with the M12 schema changes
   (`is_test_data` on 12 tables, `hotel.activate`/`demo_data.manage` permission keys, the 4 new
   RPC signatures) in the meantime.
8. **The hotel-status field was removed from the free-form settings form**
   (`HotelSettingsForm.tsx`/`settings/actions.ts`) — before M12, any user with
   `hotel.settings.manage` could flip `hotels.status` between `onboarding`/`active`/`suspended`
   with zero readiness gating, which is exactly the gap the onboarding/activation flow closes.
   The settings page now shows status as a read-only badge linking to the new Onboarding page;
   the only way to move a hotel from `onboarding` to `active` is `activateHotelAction`, which
   re-runs every readiness check server-side (never trusting a client-side "all passed"
   signal) before allowing the transition.
9. **No hotel-suspend workflow was built.** The brief's activation rules only govern the
   `onboarding` -> `active` transition; suspending an already-active hotel isn't mentioned and
   no such action exists today (only organizations have a suspend action, via `/admin`).
   Flagged as a gap for a future milestone if hotel-level suspension becomes a real need, not
   silently addressed.

## Real Supabase activation — DONE 2026-07-23

**Activation is complete.** A real Supabase project now exists (ref `cwcmjtglxyojsjzvunsf`,
region `eu-central-1`, Postgres 17) and `.env.local` holds its real anon/service_role keys.
All 70 migrations (`20260723090001`–`20260802190011`, i.e. 24 for M1–M3, 6 for M4, 4 for M5,
6 for M6, 3 for M7, 5 for M8, 5 for M9, 6 for M10, 11 for M11) were applied via `supabase db push
--db-url "<session-mode pooler URI>"` — the CLI is *not* linked and has no access token; the
direct `--db-url` path was used instead (session pooler, port 5432). M1–M11 were all applied in
the same session.

Verified after applying:
- 21 tables present and API-exposed; RLS active (an `anon` REST read returns `[]`, not a
  permission error — so grants + RLS are both correct, and the newer "always-revoked" default
  did not strip API access).
- Seed rows: 5 roles, 26 permissions, 83 role→permission grants.
- End-to-end: creating an `auth.users` row fired `handle_new_user()` and auto-created the
  matching `profiles` row; deleting the user cascaded the profile away. Test user removed.
- After M4: 25 tables total, 31 permissions; the private `kb-documents` Storage bucket exists
  (25 MB limit + MIME allow-list) with `storage.objects` RLS. `next build`/`tsc`/`eslint` clean,
  and all new routes redirect unauthenticated requests to `/login` (dev-server smoke test).
- After M5: 28 tables total, 35 permissions (`channels`/`conversations`/`messages` added).
  `next build`/`tsc`/`eslint` clean; all inbox routes redirect unauthenticated to `/login`.
- After M6: 33 tables total, 41 permissions (`room_types`/`rooms`/`rate_plans`/`guests`/
  `reservations` added). `next build`/`tsc`/`eslint` clean; all PMS/guests/reservations routes
  redirect unauthenticated to `/login`.
- After M7: 34 tables total, 42 permissions (`booking_settings` + 4 public RPCs added).
  `next build`/`tsc`/`eslint` clean. Verified against the live DB: anon can EXECUTE
  `booking_hotel_public` (returns `[]` for an unknown slug, not a permission error) and anon
  reading `reservations` directly returns `[]` (no PII leak). `/book/*` returns 200 unauthenticated
  (public); `.../booking` (internal) 307s to `/login`.
- After M8: 38 tables total, 45 permissions (`hotel_voice_settings`/`calls`/`call_events`/
  `call_recordings` added). Main app `next build`/`tsc`/`eslint` clean; `voice-service` typechecks
  and builds independently (`npm run typecheck` / `npm run build` inside `voice-service/`), and
  is confirmed excluded from the root `tsc`/`eslint` runs. `voice-service` started locally against
  the live project: `/health` responded, `/calls/simulate` correctly 401'd with no/wrong auth,
  400'd with a missing `hotelSlug`, and — with correct auth — made a real Supabase query and
  returned a clean "Hotel not found" error (no hotel exists yet under the user's org, so full
  success wasn't exercised this session; the DB round-trip and error path are verified). The
  stub `/realtime` WebSocket endpoint was confirmed to accept a connection, send its stub
  message, and close. `npm audit` on `voice-service` found 0 vulnerabilities after pinning `ws`
  to a patched version (8.0.0–8.20.1 had two disclosed advisories).
- After M9: 42 tables total, 49 permissions (`api_keys`/`webhooks`/`webhook_deliveries`/
  `integrations` added). `next build`/`tsc`/`eslint` clean; all new `/api/v1/*` routes registered.
  Verified against the live DB: internal `.../integrations/*` routes 307 to `/login`
  unauthenticated; `/api/v1/*` routes correctly do NOT redirect (proving the required middleware
  fix works) and return JSON 401s — including a real Supabase query for a garbage bearer token
  ("Invalid API key", not a generic failure, proving the DB round-trip through
  `lib/supabase/admin.ts` works). A full success run of `POST /api/v1/reservations` was not
  exercised — the user's one hotel exists (`slug: test`) but is still `onboarding` status (the
  route requires `active`), and no API key/test data was written into the live tenant to force a
  path around that (consistent with the auto-mode boundary — see below).
- After M10: 46 tables total, 51 permissions (`plans`/`organization_subscriptions`/
  `platform_settings`/`platform_moderation_flags` added). `next build`/`tsc`/`eslint` clean; all
  new `/admin/*` and `.../billing` routes registered and 307 to `/login` unauthenticated.
  Verified against the live DB: 3 plans seeded (`starter`/`professional`/`enterprise`); the
  singleton `platform_settings` row present; the backfill migration gave every pre-existing
  organization (both in the live project at the time) a `starter`/`trialing` subscription —
  confirmed via a direct count; anon correctly reads `[]` from both `plans` and
  `platform_settings` (both `to authenticated` only, unlike M7's deliberately anon-readable
  booking RPCs).
- After M11: 52 tables total, 55 permissions (`rate_plan_seasons`/`folios`/`folio_line_items`/
  `folio_payments`/`housekeeping_tasks`/`channel_manager_sync_logs` added). `next build`/`tsc`/
  `eslint` clean; all new routes (`housekeeping`, `pms/rates/[ratePlanId]`,
  `integrations/connectors/[connectorId]`) 307 to `/login` unauthenticated. Verified against the
  live DB: `reservation_nightly_total(null, 100, 3 nights)` correctly returns `300` (no-season
  fallback path); `rate_plan_nightly_rate` with a nonexistent plan id correctly falls back to the
  supplied fallback rather than erroring; `create_reservation_folio` with a nonexistent
  reservation id correctly raises a clean exception; `booking_create` (replaced to call these
  internally) still resolves to "Hotel not found" for a fake hotel, proving the replacement
  deployed and runs correctly. **A real anon-access vulnerability was found and fixed live** —
  see decision #1 below for the full account; the fix was verified by a second round of live
  anon-vs-authenticated calls, not assumed. No full success run of the folio/housekeeping/sync
  flows was exercised — the user's hotel has no room types/rate plans yet to book against.

- After M12: 57 permissions (`hotel.activate`/`demo_data.manage` added), `is_test_data` column
  present on exactly 12 tables (verified by count), RLS enabled on every `public` table with
  zero exceptions. `next build`/`tsc --noEmit`/`eslint .` clean; all new routes (`onboarding`,
  `test-data`, `/admin/system-health`, `/invite/[token]`) 307 to `/login` unauthenticated; the
  existing public `/book/*` route still returns 200 (no regression). Verified against the live
  DB: all 5 new `SECURITY DEFINER` functions (`seed_hotel_test_data`, `remove_hotel_test_data`,
  `assert_hotel_owner_or_superadmin`, `accept_invitation`, `get_invitation_preview`) correctly
  return `42501 permission denied` for an anon caller (confirmed via direct REST RPC calls, not
  assumed), and their `pg_proc.proacl` shows only `postgres`/`service_role`/`authenticated` —
  no `anon` entry on any of them; the existing anon-executable `booking_hotel_public` RPC still
  returns `[]` for an unknown slug (no regression to the M7 public booking surface).
  `trg_profiles_platform_role_guard` confirmed still enabled (`tgenabled = 'O'`) after the
  migrations applied (that trigger itself was not touched by M12). **Not exercised live this
  session** (same category of gap as M8/M9/M11's "no test data yet" notes): the
  `requireOwnerOrSuperadmin()` four-way role test and a real invite-then-accept round trip —
  both need either the demo login granted a role/membership or `ENABLE_DEMO_DATA_SEEDING=true`
  plus a seeded hotel, neither of which auto-mode performs unprompted (privileged role grants
  and enabling test-data seeding in the live environment are both left to the user). See
  `docs/security-followups.md` for the exact follow-up steps.

A demo login was created this session — `admin@spico.local` (auth user id
`f55d3b89-6afa-418a-8051-121c17c931e0`) — but auto-mode **blocked** granting it any role
(owner membership / platform superadmin) because that writes privileged rows to the live
project. The grant must be run by the user (Supabase SQL editor) or with an explicit
permission rule; the account has no access until then.

Still deferred:
- `lib/supabase/types.ts` codegen — this CLI version runs `gen types` through a Docker
  container (Docker down, C: nearly full). Regenerate later via Docker running, or the
  Management API + a personal access token. **Preserve the hand-written domain unions**
  (`PermissionKey`/`RoleKey`/`PlatformRole`/`AuditActorType`) — they're CHECK-constrained
  columns codegen can't reproduce and `authz.ts`/`audit.ts` import them directly.

The original activation runbook (kept for reference / re-use on another project):

To activate a project from scratch:

1. Create a Supabase project (or use an existing one) at supabase.com, or run one locally
   (`npx supabase start` — requires Docker Desktop actually running).
2. In `WebTemplate/.env.local` (already gitignored), replace the placeholder values with,
   at minimum:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project Settings → API → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API → anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → service_role key (server-only;
     never reference this from a Client Component)
   - `NEXT_PUBLIC_APP_URL` — e.g. `http://localhost:3000` for local dev
3. From `WebTemplate/`, link the CLI to your project (you'll need your project ref from the
   Supabase dashboard URL, and will be prompted for your database password):
   ```
   npx supabase link --project-ref <your-project-ref>
   ```
4. Check what would be applied before applying it:
   ```
   npx supabase migration list
   ```
5. Apply the migrations (all 24 files, `20260723090001`–`20260725110009`):
   ```
   npx supabase db push
   ```
   This is additive/forward-only — it will not run unless you've confirmed the linked
   project via step 3, and it does not reset or drop anything.
6. Verify after applying: confirm in the Supabase dashboard (Table Editor) that `profiles`,
   `organizations`, `hotels` (with the new columns), `roles`, `memberships`, `permissions`,
   `role_permissions`, `invitations`, `audit_log`, `departments`, `membership_departments`,
   `hotel_business_hours`, `hotel_holidays`, `ai_agents`, `ai_agent_languages`,
   `ai_agent_capabilities`, `ai_agent_schedules`, `ai_agent_handoff_rules`,
   `ai_agent_approval_policies`, `ai_agent_prompt_versions`, and `ai_agent_test_sessions`
   all exist, that RLS shows as enabled on each (a shield icon in Table Editor), and that
   `roles`/`permissions`/`role_permissions` have the seeded rows (5 roles, 26 permissions,
   ~60 role/permission grants).
7. **Never run `supabase db reset` against this project** once it holds real data — that
   command drops and recreates the database from migrations, which is fine against a fresh
   local/dev project but destructive against anything with real signups.

(The steps above were followed on 2026-07-23 against project `cwcmjtglxyojsjzvunsf` — see the
"DONE" note at the top of this section.)

## Environment issue found during implementation (not project-related, but blocking)

Your `C:` drive was at **0 bytes free** (111 GB used / 111 GB total) during this session.
This directly caused one failed `npm install` (ENOSPC while writing to the default
`C:`-based npm cache) and several `ls`/`sort`/pipe failures in the shell. Everything in
this milestone was built successfully by routing package-manager cache and all project
files to `D:` (569 GB free), but this is worth freeing up on your end — a full system drive
can cause subtler failures elsewhere (OS temp files, browser caches, other tools) that
won't route around it as easily as this session did.

## Explicitly out of scope for now (per your instructions, not forgotten)

OpenAI Realtime voice connections, Telnyx call routing, PMS database migrations, booking
engine logic, payment processing, full integration connectors, Redis/Upstash. These are
sequenced in `roadmap.md` (M8–M10) and referenced structurally in `architecture.md` so the
foundation doesn't box them out, but no code for them exists.

## M14 — Local launch, UI stabilization & bug-fix sprint (2026-07-27)

Assumptions/decisions made during the M14 UI audit + fixes (full findings in
`docs/ui-bug-audit.md`):

1. **Used the existing running dev server's project, on port 3000**, rather than the
   `NEXT_PUBLIC_APP_URL=3100` value in `.env.local`. Next 16 refuses a second dev instance of
   the same project; the pre-existing instance had crashed into a 500-on-every-route worker
   state, so it was killed and restarted clean. Port 3000 vs 3100 only affects absolute-URL
   generation (e.g. invite links), not local browsing.
2. **Authenticated screens were audited from source, not driven live** — no local account
   password is available and registration/login could not be completed in this session.
   Findings that could not be reproduced against a live authenticated screen are marked
   *(source)* in the bug audit and were confirmed by reading the component/SCSS.
3. **Destructive-action confirmation uses native `window.confirm()`**, not a custom modal.
   Rationale: zero new dependencies, no new modal/z-index surface, consistent with the repo's
   existing "explicit gate before irreversible action" stance (the Test-Data tool already
   gated via a checkbox). A styled confirm dialog can replace it later without touching call
   sites (single component).
4. **`/profile` is intentionally read-only.** Editing name/email would need a new server
   action + validation and touches auth/profile data; out of scope for a stabilization pass.
   The page states details are administrator-managed rather than showing a non-functional
   form (no fake UI).
5. **Mobile table fix is CSS-only** (`.spico-table` becomes a horizontal-scroll block under
   768px) instead of wrapping every table in markup. Lower-risk, no per-page edits, desktop
   unchanged.
6. **No schema, RLS, SECURITY DEFINER, or business-logic changes** were made — every fix was
   UI/UX only, per the milestone constraints.

## M15 — Live Voice MVP (2026-07-27)

Decisions/assumptions building the real Telnyx + OpenAI Realtime voice path in `voice-service/`
(full runbook in `voice-service/README.md`):

1. **Credential-presence gating, not a mode flag.** Real Telnyx is used only when
   `TELNYX_API_KEY` + `TELNYX_PUBLIC_KEY` are set; real OpenAI Realtime only when
   `OPENAI_API_KEY` is set; a fully-live inbound call also needs `PUBLIC_BASE_URL`. With none
   set, the service boots and behaves exactly like the M8 stub/simulate path. This keeps the
   repo runnable with zero secrets while the identical code goes live when secrets appear.
2. **Webhooks are never processed unverified.** If `TELNYX_PUBLIC_KEY` is set, the Ed25519
   signature is required (401 on failure). If it is *not* set, webhooks are acked 200 but
   explicitly not processed — we never drive call control from an unauthenticated request.
3. **Audio format:** Telnyx bidirectional streaming uses PCMU (G.711 μ-law 8kHz), which equals
   OpenAI Realtime's `g711_ulaw`. Frames pass through as base64 with no transcoding.
4. **Active-call correlation is in-memory** (`src/callRegistry.ts`), keyed by Telnyx
   `call_control_id`, adequate for a single-instance MVP. Documented hardening: add a
   `provider_call_id` column to `calls` for restart-durable, horizontally-scalable correlation.
   No schema change was made this milestone.
5. **Voice tools are read-only + control only** for now: `check_availability`,
   `lookup_reservation` (last-name verified before disclosing details, per the platform safety
   rule), `transfer_to_human`, `end_call`. Booking-creation / reservation-modification
   capabilities exist in config but are NOT auto-executed on a call — the agent transfers to a
   human, so a caller can't mutate reservations outside the dashboard's approval workflow.
6. **Verification boundary (honest):** signature verification, verified-event routing, DB
   lookup, fallback dispatch, decision/tool-gating logic, and `calls`/`call_events` writes are
   verified locally (`npm run selftest` + a boot smoke test against the real Supabase project).
   Real Telnyx REST calls, the live OpenAI Realtime audio bridge, and an end-to-end PSTN call
   are NOT verified — they require live credentials + a public deployment. The user opted to
   provide credentials; the next step is following the README runbook for a live test call.
7. **The main Next.js app was not modified** — M15 is entirely within `voice-service/`, which is
   excluded from the app's `tsc`/`eslint`/`next build`. The app still only reads the
   `calls`/`call_events` tables the service writes (M8's decoupling preserved).
