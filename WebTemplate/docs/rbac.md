# Spico — RBAC Model

Status: implemented through Milestone 12 — every milestone in the original roadmap plus the M11
PMS follow-up and the M12 production-readiness follow-up (auth/RBAC foundation, hotel
operations, AI agent configuration, knowledge base, omnichannel inbox skeleton, reservations &
PMS core, public booking engine, voice foundation, integrations/API keys/webhooks,
billing/platform administration polish, PMS completion: housekeeping/folio/seasonal
rates/channel sync, and M12's onboarding/plan-limit/test-data/platform-bootstrap work). M1-M11
migrations have been executed against the live Supabase project; M12's migrations are written
and pending an explicit sign-off + `db push` before they are live — see `assumptions.md`.

## 1. Roles

Two role families, matching the brief exactly:

### Hotel/organization roles (stored in `memberships.role_key`, hierarchical via `roles.rank`)

| Role | Scope | Typical rank (low → high) |
|---|---|---|
| Receptionist | hotel | 1 |
| Reception Manager | hotel | 2 |
| Reception Managers Manager | hotel or org (oversees multiple hotels' reception chains) | 3 |
| Hotel General Manager | hotel | 4 |
| Hotel Owner | org (can span multiple hotels) | 5 |

### Platform roles (stored in `profiles.platform_role`, not tenant-scoped)

| Role | Scope |
|---|---|
| Platform Moderator | cross-tenant, read + limited moderation actions |
| Platform Admin | cross-tenant, full operational access |
| Platform Superadmin | cross-tenant, full access incl. platform configuration and role grants |

Platform roles are a strict superset boundary: they are checked **separately** from
org/hotel RBAC, never merged into the same rank scale, since a Platform Moderator should
not implicitly inherit "Hotel Owner"-level data-mutation rights just by having a higher
number — platform access and tenant access are different axes.

## 2. Permission model

Permissions are expressed as `(action, resource)` pairs (e.g. `reservations.cancel`,
`agents.configure`, `team.invite`, `audit_log.read`, `integrations.manage`). A role grants a
fixed permission set; membership rank is used only for **within-hotel escalation checks**
(e.g. "can this role manage another user whose role rank is lower"), not for permission
lookup itself.

Baseline shape (fully enumerated permission-by-module matrix is built out as each module
ships — Milestone 1 only needs the modules below):

| Module | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| Hotel dashboard (view) | ✅ own hotel | ✅ own hotel | ✅ managed hotels | ✅ own hotel | ✅ org hotels | ✅ read-only, all | ✅ all | ✅ all |
| Team & roles (view) | ❌ | ✅ own hotel | ✅ managed hotels | ✅ own hotel | ✅ org hotels | ❌ | ✅ all | ✅ all |
| Team & roles (invite/change role) | ❌ | ✅ ranks below self | ✅ ranks below self | ✅ own hotel | ✅ org hotels | ❌ | ✅ all | ✅ all |
| Org/hotel settings | ❌ | ❌ | ❌ | ✅ own hotel | ✅ org hotels | ❌ | ✅ all | ✅ all |
| Audit log (read) | ❌ | ❌ | ✅ managed hotels | ✅ own hotel | ✅ org hotels | ✅ all (read-only) | ✅ all | ✅ all |
| Platform administration (orgs, suspensions, global config) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Role/permission scheme changes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Modules not yet built (Inbox, Calls, Automations, Reservations, PMS, Booking Engine,
Guests, Knowledge Base, Analytics, Integrations) get their own rows in this matrix when
each ships — the pattern (view vs. manage vs. configure, scoped by hotel vs. org vs.
platform) carries forward unchanged.

### Milestone 2 additions

Hotel profile fields reuse the existing `hotel.settings.manage` permission (same audience
for both viewing and editing the settings page — no role currently needs read without
write). Audit visibility reuses the existing `audit_log.view` permission (a proposed
`audit_logs.read` was dropped as a duplicate). New permission keys:

| Module | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| Departments (view) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| Departments (create/edit/activate/deactivate) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Business hours (view) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| Business hours (manage) | ❌ | ❌ | ❌ | ✅ own hotel | ✅ org hotels | ❌ | ✅ | ✅ |
| Holidays (view) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| Holidays (manage) | ❌ | ❌ | ❌ | ✅ own hotel | ✅ org hotels | ❌ | ✅ | ✅ |
| Assign team member to department | ❌ | ✅ ranks below self | ✅ ranks below self | ✅ own hotel | ✅ org hotels | ❌ | ✅ | ✅ |

Business hours/holidays *manage* is deliberately restricted to the same audience as
`hotel.settings.manage` (GM/Owner only) rather than also granted to Reception Manager —
these are hotel-wide configuration that will later drive AI scheduling/handoff behavior,
not day-to-day reception work, so the higher bar matches the existing "Org/hotel settings"
row above. `team.departments.assign` is checked via the same rank-aware
`can_manage_membership()` path as role changes — a Reception Manager assigning a department
still can't act on a membership whose role rank is at or above their own.

### Milestone 3 additions — AI Agent Configuration

13 new granular permissions, one per distinct action rather than a single `ai_agents.manage`
— configuration/policy is sensitive enough that "who can view," "who can create," "who can
flip a status," and "who can govern approval policy" are worth being separately grantable,
even though the current seed grants most of them together per role.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `ai_agents.read` (view) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| `ai_agents.test` (playground) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.create` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.update` (overview fields) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.activate` (activate/deactivate) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.archive` | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.manage_languages` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.manage_capabilities` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.manage_schedules` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.manage_handoff` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.manage_policies` (approval policy) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.manage_prompts` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.restore_prompt_version` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

Notes:
- **Reception Manager gets `read`/`test` only in the baseline seed**, matching the brief's
  "may manage limited configuration if granted" — there's no per-user permission-override
  UI yet to actually grant more, so the baseline stays conservative. Extending a specific
  Reception Manager's access requires a future admin UI, not a role-wide change.
- **`archive` and `manage_policies` are GM/Owner-only**, withheld even from Reception
  Managers Manager — matches the M2 precedent (business hours/holidays *manage*) of
  reserving irreversible or governance-level actions for the highest hotel-scoped roles.
- **The `ai_agents` update RLS policy admits any of `update`/`activate`/`archive`** (see
  the migration), since all three write to the same table; the *specific* action a user
  can trigger is gated by which server action they can reach (each checks its own precise
  permission before calling `update()` at all) — RLS is the safety net, not the only gate.
- **No live approval queue exists** — `ai_agents.manage_policies` only gates the policy
  *configuration* screen, not an actual approval action (there is none yet).

### Milestone 4 additions — Knowledge Base

5 new permissions. Knowledge content is split into three separately-grantable manage
permissions (categories / articles / documents) over one shared `kb.read`, plus one
agent-configuration permission for pointing an agent at knowledge.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `kb.read` (view KB) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| `kb.categories.manage` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `kb.articles.manage` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `kb.documents.manage` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ai_agents.manage_knowledge` (assign sources) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

Notes:
- **`ai_agents.manage_knowledge` lives in the `ai_agents` module, not `knowledge_base`** —
  assigning knowledge to an agent is agent configuration, even though the content it points
  at is governed by the `kb.*` permissions. It mirrors the other `ai_agents.manage_*` grants.
- **The KB enable/disable toggle on an agent is gated by `ai_agents.update`, not
  `manage_knowledge`**, because it writes to the `ai_agents` row (whose UPDATE RLS admits
  `update`/`activate`/`archive`). Every role granted `manage_knowledge` is also granted
  `update`, so no role can assign sources but be unable to flip the master switch.
- **Reception Manager stays read-only** in the baseline seed, consistent with its M3 stance —
  it can see the knowledge base but not edit it without a future per-user override.
- **Storage RLS uses the same permissions**: `storage.objects` policies on the `kb-documents`
  bucket key `kb.read` (download) and `kb.documents.manage` (upload/delete) off the object
  path's first segment (the `hotel_id`), so file access is tenant-scoped the same way the
  `kb_documents` table rows are.

### Milestone 5 additions — Omnichannel Inbox

4 new permissions covering read, reply, triage, and channel configuration.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `inbox.view` (read threads) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (guest PII) | ✅ | ✅ |
| `inbox.send` (reply / compose) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `inbox.manage` (assign/status/priority) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `channels.manage` (configure channels) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

Notes:
- **Receptionist can read and reply but not triage** — front-line staff handle conversations;
  assignment/status/priority is a Reception Manager-and-up responsibility.
- **`inbox.view` is the first read permission withheld from Platform Moderator.** Every M1–M4
  read permission set `platform_moderator_can_read = true`; conversations carry guest PII, so
  this one is `false`. Platform Admin/Superadmin still reach it via the platform-role bypass.
- **The `conversations` UPDATE policy admits `inbox.send` OR `inbox.manage`** (replying updates
  the last-message fields; managing changes status/assignment) — both write the same row, and
  each server action checks its precise permission first. Same pattern as M3's `ai_agents`.
- **Messages are insert/select only** — no update or delete policy exists; a thread is
  append-only in the skeleton.

### Milestone 6 additions — Reservations & PMS

6 new permissions across room inventory, guests, and reservations.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `pms.read` (view rooms/types/rates) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| `pms.manage` (edit inventory) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `guests.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (PII) | ✅ | ✅ |
| `guests.manage` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `reservations.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (PII) | ✅ | ✅ |
| `reservations.manage` (book/check-in/out/cancel) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

Notes:
- **Receptionist has full front-desk operations** — creating/editing guests and the whole
  reservation lifecycle (book, check in, check out, cancel) are the receptionist's core job, so
  `guests.manage`/`reservations.manage` are granted at the base level (unlike, say, AI-agent or
  channel configuration, which are manager-and-up).
- **`pms.manage` (room/type/rate configuration) is Reception-Managers-Manager-and-up** — the room
  inventory and pricing setup is a configuration task, not a daily front-desk one, matching the
  M2/M3 stance on hotel-wide configuration.
- **`guests.read`/`reservations.read` carry PII and are withheld from Platform Moderator**
  (like M5's `inbox.view`). `pms.read` (inventory config) keeps the moderator read grant.

### Milestone 7 additions — Public Booking Engine

1 new permission, plus a whole access path that needs **no** permission.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `booking.manage` (configure public booking) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |

Notes:
- **The guest-facing flow is unauthenticated and permission-free by design.** It goes entirely
  through `SECURITY DEFINER` RPCs with EXECUTE granted to `anon`; those functions bypass RLS but
  return only derived, non-sensitive data and enforce their own validation. This is the one place
  in the system where access is *not* mediated by `has_permission()` — the safety boundary is the
  function bodies (what they select/return/insert), not row policies.
- **`booking.manage` gates only the internal config screen** (enable/disable, stay limits, terms)
  and sits at the same tier as `pms.manage` — it's hotel-wide configuration.
- **Public bookings write a `pending` reservation** via the definer function; confirming it uses
  the normal `reservations.manage` permission in the internal UI, so the RBAC boundary reasserts
  itself the moment staff touch the booking.

### Milestone 8 additions — Voice

3 new permissions. Only `voice-service` (via the service-role key, which bypasses RLS/permissions
entirely) writes `calls`/`call_events` today — the policies below are the defense-in-depth layer
for any future in-dashboard call-handling feature, and gate the read/annotate surface that exists.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `voice.manage` (configure voice) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| `calls.read` (view call history) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (phone numbers) | ✅ | ✅ |
| `calls.manage` (annotate, mark handoff done) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

Notes:
- **`calls.read`/`calls.manage` are granted at the Receptionist base level**, matching M6's
  stance that day-to-day guest-facing operations (here: reviewing/annotating calls, completing a
  flagged handoff) belong to front-line staff, not just managers.
- **`voice.manage` sits with `pms.manage`/`booking.manage`** (Reception Managers Manager and up)
  — it's hotel-wide configuration (which AI agent answers calls), not a daily task.
- **The voice-service itself needs no permission check** — it authenticates to Supabase with the
  service-role key (bypasses RLS) and to itself with a separate shared secret
  (`VOICE_SERVICE_SHARED_SECRET`, unrelated to the `permissions`/`role_permissions` model). It is
  server-to-server infrastructure, not a user acting through the dashboard.

### Milestone 9 additions — Integrations, API keys, webhooks

4 new permissions. This surface is back-office/technical, not front-desk work, so `integrations.read`
starts at Reception Managers Manager (the first read permission in the project *not* granted at
the Receptionist/Reception Manager base level) and every `*.manage` action is GM/Owner-only.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `integrations.read` (view, not secrets) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| `api_keys.manage` (issue/revoke) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `webhooks.manage` (create/edit/disable) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `integrations.manage` (connectors) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |

Notes:
- **All three `*.manage` actions are GM/Owner-only**, withheld even from Reception Managers
  Manager — matches the M3 precedent of reserving governance-level, high-blast-radius actions
  (`ai_agents.archive`/`manage_policies`) for the top hotel-scoped roles. A leaked API key or a
  malicious webhook URL can create fraudulent reservations or exfiltrate guest data; this is
  meaningfully higher-stakes than typical hotel-wide configuration like `pms.manage`.
- **`integrations.read` deliberately does NOT grant access to key/secret material** — it only
  gates viewing metadata (key prefix, webhook URL, event types, connector status). Seeing an
  API key's plaintext is never possible for anyone (only a hash is stored); seeing a webhook's
  signing secret requires `webhooks.manage` specifically, not just `integrations.read`.
- **The Open API itself (`app/api/v1/*`) is not gated by this permission model at all** — it
  authenticates via an API key's own `scopes` array (`lib/apiKeys.ts`), a separate, narrower
  system designed for third-party integrations rather than internal staff roles. An API key
  cannot reach any permission a Receptionist doesn't also effectively have via the two exposed
  endpoints (`read:availability`, `write:reservations`).

### Milestone 10 additions — Billing, plans, platform settings, moderation

2 new ORGANIZATION-scoped permissions (`billing.*`). Plans/settings/moderation are gated
differently — via `requirePlatformRole()` checking `profiles.platform_role` directly, the same
mechanism `/admin`'s existing org suspend/reactivate has used since M1, not the `permissions`/
`role_permissions` table at all. This has always been how platform-wide administration works in
this project (it isn't org/hotel-scoped, so the has_permission() model doesn't naturally fit) —
M10 extends that existing pattern to three new pages rather than introducing a second one.

| Action | Receptionist…Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|
| `billing.read` (org-scoped) | ❌ | ❌ | ✅ | ✅ read-only (via platform bypass) | ✅ | ✅ |
| `billing.manage` (org-scoped, change plan) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Plan catalog — read | — | — | — | ✅ | ✅ | ✅ |
| Plan catalog — write (`/admin/plans`) | — | — | — | ❌ | ❌ | ✅ only |
| Platform settings — read | — | — | — | ✅ | ✅ | ✅ |
| Platform settings — write (`/admin/settings`) | — | — | — | ❌ | ✅ | ✅ |
| Moderation — raise a flag (`/admin/moderation`) | — | — | — | ✅ | ✅ | ✅ |
| Moderation — resolve a flag | — | — | — | ❌ | ✅ | ✅ |

Notes:
- **`billing.manage` is Hotel Owner ONLY** — not even Hotel General Manager, the first
  hotel-wide-config permission in the project this strict. Real financial consequence (a plan
  change) is reserved for the account owner, not general management. See `assumptions.md` M10 #2.
- **Even Platform Admin/Superadmin do NOT bypass into `billing.manage`'s org-scoped UI** the way
  they bypass `has_permission()` elsewhere — `organization_subscriptions`' RLS *does* let
  admin/superadmin update any org's subscription (defense in depth / support tooling), but no
  admin-side page exposes that yet; only the org's own Owner has a UI for it today.
- **Plan catalog writes are `requirePlatformRole(["superadmin"])` — stricter than every other
  platform-admin action**, which use `["admin", "superadmin"]` (org suspend, platform settings).
  A pricing change is platform-wide-simultaneous impact, the highest blast radius added in any
  milestone. See `assumptions.md` M10 #3.
- **Moderation flags are Platform Moderator's first write capability anywhere in the system.**
  Every other Moderator grant to date has been `platform_moderator_can_read = true` on read-only
  permissions (config visibility). Raising a flag is real but deliberately narrow — it cannot
  resolve its own flag or take the underlying action (suspend), which stays admin+superadmin-only.

### Milestone 11 additions — PMS completion (housekeeping, folio, seasonal rates, channel sync)

4 new permissions (`folio.*`, `housekeeping.*`). Channel-manager sync reuses M9's
`integrations.read`/`integrations.manage`; seasonal rate calendars reuse M6's `pms.read`/
`pms.manage` — no new permissions needed for either, since both are naturally extensions of
existing permission-gated surfaces (a connector action; room/rate configuration).

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `folio.read` (view charges/payments) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (billing-adjacent) | ✅ | ✅ |
| `folio.manage` (add charges, record payments) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `housekeeping.read` (view task board) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| `housekeeping.manage` (create/assign/advance tasks) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

Notes:
- **`folio.*`/`housekeeping.*` are granted at the Receptionist base level**, matching M6's
  `guests.*`/`reservations.*` precedent — recording a payment, adding a charge, and running the
  housekeeping board are core daily front-desk work, not manager-tier configuration. This is a
  deliberately different stance from M9's `api_keys`/`webhooks` (GM/Owner-only) and M10's
  `billing.manage` (Hotel-Owner-only): those carry platform/financial-account-level risk, folio
  charges/payments are ordinary day-to-day operations at the scale a receptionist already
  handles via `reservations.manage`.
- **`folio.read` is withheld from Platform Moderator** (`platform_moderator_can_read = false`) —
  folio line items and payment records are guest-billing data, treated with the same PII-adjacent
  caution as `guests.read`/`reservations.read` (M6) rather than the broader config-read stance
  most M6–M9 permissions get.
- **The `create_reservation_folio`/`reservation_nightly_total`/`rate_plan_nightly_rate` SQL
  functions are NOT gated by this permission model at all** — they're internal, `SECURITY
  DEFINER` functions called by server actions/RPCs after those actions have already checked the
  relevant permission (or, for `booking_create`, after its own anonymous-safe validation). A real
  access-control gap was found and fixed in how these functions' database-level `EXECUTE`
  grants were configured (not the `has_permission()`/RBAC model itself) — see
  `assumptions.md` M11 #1 for the full account.

### Milestone 12 additions — Production readiness, onboarding, plan enforcement, test data

2 new permissions. `hotel.activate` follows the normal `has_permission()`/RLS model;
`demo_data.manage` is added to the catalog for documentation/matrix completeness but is
**deliberately not enforced via `has_permission()`** — see the important exception below.

| Action | Receptionist | Reception Mgr | Reception Mgrs Mgr | Hotel GM | Hotel Owner | Platform Moderator | Platform Admin | Platform Superadmin |
|---|---|---|---|---|---|---|---|---|
| `hotel.activate` (activate once readiness passes) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ read-only | ✅ | ✅ |
| `demo_data.manage` (seed/remove test data) | ❌ | ❌ | ❌ | ❌ | ✅ (non-standard, see below) | ❌ | ❌ (non-standard, see below) | ✅ (non-standard, see below) |

**IMPORTANT EXCEPTION — read before adding any future permission that must exclude Platform
Admin.** `has_permission()`'s SQL body (`supabase/migrations/20260723090009_policies.sql`)
grants a universal bypass to **both** `platform_role in ('admin', 'superadmin')` — every
permission check in this project up to M12 implicitly let Platform Admin through. The
Milestone 12 brief requires the test-data seeding tool to be **Hotel Owner + Platform
Superadmin ONLY, excluding Platform Admin** — the first feature in the project that must
deliberately narrow that bypass. Routing it through the standard `requirePermission()` would
have silently admitted Platform Admin anyway. Instead, `lib/demoData.ts`'s
`requireOwnerOrSuperadmin()` is a hand-rolled, non-standard authorization check used ONLY by
the test-data seeding page/actions — it never calls `has_permission()`/`requirePermission()`.
The underlying `seed_hotel_test_data()`/`remove_hotel_test_data()` SQL functions
(`supabase/migrations/20260803100003`) independently re-check the same owner-or-superadmin
condition inside the function body itself (via `assert_hotel_owner_or_superadmin()`), since
`EXECUTE` is granted to `authenticated` generally and any logged-in user could otherwise
invoke the RPC directly, bypassing the app layer entirely. **Do not copy this pattern for a
normal permission** — it exists only because this one feature's access boundary is narrower
than `has_permission()`'s built-in platform bypass allows.

Notes:
- `hotel.activate` is a separate permission from `hotel.settings.manage` (not reused),
  following the M3 precedent of `ai_agents.update` vs `ai_agents.activate` being separately
  grantable even though the baseline seed grants both to the same roles today — this lets a
  future change (e.g. restricting activation to Owner-only) happen without re-touching the
  settings permission.
- Plan-limit enforcement (`lib/planLimits.ts`) and the invitation-acceptance flow
  (`accept_invitation()`, `supabase/migrations/20260803100004`) are not gated by new
  permissions at all — they read existing `organization_subscriptions`/`plans` data and
  existing `hotel.settings.manage`/membership-creation paths respectively. `accept_invitation`
  is its own `SECURITY DEFINER` function (not a permission-gated table write) because
  `memberships_insert`'s RLS has no path for a not-yet-a-member invited user to insert their
  own row — see that migration's header comment.

## 3. Enforcement layers (defense in depth)

Every one of these three layers is required — none is sufficient alone:

1. **Row Level Security (Postgres/Supabase)** — the ground truth. Every tenant-owned table
   has policies keyed off `auth.uid()` joined through `memberships`/`profiles.platform_role`.
   Example shape for a hotel-scoped table:

   ```sql
   create policy "hotel members can select"
     on public.some_hotel_table
     for select
     using (
       exists (
         select 1 from memberships m
         where m.hotel_id = some_hotel_table.hotel_id
           and m.profile_id = auth.uid()
           and m.status = 'active'
       )
       or exists (
         select 1 from profiles p
         where p.id = auth.uid()
           and p.platform_role is not null
       )
     );
   ```

   Write policies additionally check `role_key` against the permission the mutation
   requires (via a `has_permission(auth.uid(), hotel_id, 'action.name')` SQL function so the
   logic isn't duplicated across every policy).

2. **Server-side authorization in Route Handlers/Server Actions** — re-derives the caller's
   membership/role/platform_role and checks the specific permission before performing the
   mutation, even though RLS would also block it. This is what produces a clean 403 instead
   of relying on a raw Postgres denial, and it's the layer that writes to `audit_log`.

3. **Middleware route gating** — a UX layer only. Redirects obviously-unauthorized
   navigation before a page renders (e.g. a Receptionist hitting `/platform/admin`). Never
   trusted as the actual authorization boundary, since middleware can be bypassed by direct
   API calls.

## 4. AI-triggered actions

Any data mutation initiated by an AI agent (not a human request) must:

- Resolve to a specific `hotel_id`/`organization_id` and the permission it's exercising,
  exactly like a human-initiated action — no special "AI bypass" path in RLS or
  authorization checks.
- Be checked against that hotel's configured operating mode (Manual Assist / Semi-Automatic
  / Automatic) and any human-handoff/fallback rules before executing — modeled later
  alongside `ai_agent_configs` (see `erd.md` future entities), not implemented in this
  milestone.
- Write to `audit_log` with `actor_type = 'ai'` and a traceable `ai_session_id`.

## 5. Open design question for later milestones

"Reception Managers Manager" spanning multiple hotels within one org needs an explicit list
of which hotels it manages (not just "all hotels in the org," since an org could have
several independent reception chains). Milestone 1 models this as multiple
`memberships` rows (one per managed hotel, same `profile_id`, same `role_key`) rather than
inventing a separate "managed hotels" join table — revisit if that proves awkward once
Team & Roles UI is built.
