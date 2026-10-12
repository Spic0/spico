# Spico — Security Follow-ups

Findings from the Milestone 12 production-safety review. Confirmed-fixed items are folded
into `docs/assumptions.md`'s M12 section once live-verified; this file tracks anything found
but not (yet) independently re-verified against the live project, plus residual risk
accepted as-is. Per the standing rule from M11: a `SECURITY DEFINER` function's access
boundary is only trusted once tested live with a real anon/authenticated key, never from
code review alone.

## Verified live (2026-08-03, after the M12 migrations were applied)

1. **New `SECURITY DEFINER` functions' grants** — confirmed via direct REST RPC calls with a
   real anon key: `seed_hotel_test_data`, `remove_hotel_test_data`,
   `assert_hotel_owner_or_superadmin`, `accept_invitation`, `get_invitation_preview` all
   returned `42501 permission denied` for anon. `pg_proc.proacl` for all five shows only
   `postgres=X/postgres, service_role=X/postgres, authenticated=X/postgres` — no `anon` entry.
   The existing anon-executable `booking_hotel_public` RPC still returns `[]` for an unknown
   slug (no regression to the M7 public booking surface).
5. **RLS still enabled on all 12 `is_test_data`-columned tables** (and every other `public`
   table) — `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where
   n.nspname = 'public' and relkind = 'r' and not relrowsecurity;` returned zero rows against
   the live project. Column count confirmed exactly 12 tables carry `is_test_data`.
6. **New routes correctly gate unauthenticated access** — `onboarding`, `test-data`,
   `/admin/system-health`, and `/invite/[token]` all returned `307` with `Location: /login?next=...`
   for an unauthenticated dev-server request; the existing public `/book/*` route still returns
   `200` (no regression).
3 (partial). **`prevent_unauthorized_platform_role_change` trigger** confirmed still enabled
   (`tgenabled = 'O'`) after the M12 migrations applied — that trigger itself was not touched by
   this milestone. The SQL Editor auth.uid()-is-NULL gotcha documented in
   `docs/platform-bootstrap.md` was derived from reading the trigger body, not yet exercised
   against a disposable test user (see below — requires an actual role grant, which auto-mode
   does not perform unprompted).

## Still pending — needs a real user/role/test-data setup to exercise

2. **`requireOwnerOrSuperadmin()` (`lib/demoData.ts`) four-way role test** — log in as each of
   Platform Admin, Platform Moderator, a non-owner hotel role, and Hotel Owner/Platform
   Superadmin against `/o/[org]/h/[hotel]/test-data`; expect `/forbidden` for the first three
   and success for the last two. This is hand-rolled, non-standard authorization code (the only
   place in the project that deliberately excludes Platform Admin from a permission check) and
   needs its own explicit test rather than trusting code review alone. Blocked on: the live
   tenant currently has no user holding a non-owner/non-superadmin role to test against, and
   granting platform roles is a privileged action auto-mode does not perform unprompted (see
   `docs/platform-bootstrap.md`).
3. **The platform-bootstrap grant/rollback SQL itself** — run the documented procedure against
   a disposable test user, confirm it succeeds, confirm the trigger is re-enabled afterward, and
   confirm a plain `UPDATE` **without** disabling the trigger fails with the expected exception.
   Not run this session (would grant a real platform role in the live project — left to the
   user per `docs/platform-bootstrap.md`'s own warning).
4. **`accept_invitation`'s plan-limit re-check** — verify that inviting up to a plan's
   `max_users` limit, then accepting one more invitation, is correctly rejected with the
   friendly error message (not a raw constraint violation), and that the rejected acceptance
   does NOT mark the invitation `accepted` (it must remain `pending` so it can be retried after
   an upgrade). Blocked on: needs `ENABLE_DEMO_DATA_SEEDING=true` plus a hotel at its plan's
   member limit to exercise end-to-end.

## Accepted residual risk (not fixed, documented instead)

1. **`timezone_configured` readiness check is trivially always-true.** `hotels.timezone` is
   `NOT NULL DEFAULT 'UTC'`, so this check can never fail even if a hotel operator never
   actually reviewed their timezone. Accepted as a known limitation rather than adding a
   separate "reviewed" flag — flagged to the user during planning, not silently shipped.
2. **`/admin/system-health`'s storage bucket check is best-effort.** `supabase.storage.listBuckets()`
   is called with the platform admin's session client; if that call itself fails for a reason
   unrelated to the bucket's actual availability (e.g. a permissions nuance of the storage API
   for non-service-role callers), the page reports `"Not tested"` rather than a possibly
   misleading `"Unreachable"`. Confirm this call actually succeeds for a real admin session
   once live; if it doesn't, the page's fallback labeling is still honest (never claims
   connectivity it didn't verify) but the check itself may need a service-role client instead.
3. **Booking-engine readiness on `/admin/system-health` lists every hotel platform-wide** with
   no pagination. Acceptable at current scale (a handful of hotels); revisit if the platform
   grows to hundreds of hotels.
4. **No rate limiting on `/invite/[token]`'s accept action** beyond normal RLS/authorization —
   a logged-in user could hammer `accept_invitation` with guessed tokens, though tokens are
   random UUIDs (128 bits of entropy) making brute-force infeasible in practice. Consistent
   with the rest of the project's stance on Upstash-backed rate limiting being optional/absent
   outside `app/api/v1/*`.
