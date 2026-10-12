# Spico — Platform Role Bootstrap

Platform roles (`moderator` / `admin` / `superadmin`, stored on `profiles.platform_role`) are
never grantable through the app — by design. `prevent_unauthorized_platform_role_change()`
(trigger `trg_profiles_platform_role_guard`, defined in
`supabase/migrations/20260723090001_profiles.sql`) blocks any `UPDATE` that changes
`platform_role` unless the acting user (`auth.uid()`) already holds `platform_role in
('admin', 'superadmin')`. There is no dashboard button, server action, or API route anywhere
in this codebase that grants a platform role — confirmed by grep across the whole app tree
(see `docs/assumptions.md` M12). This is intentional: no authenticated user should ever be
able to self-escalate to platform admin.

This document is the only sanctioned way to grant the **first** platform operator (or any
operator when no admin/superadmin already exists to do it through a future admin UI).

**This must be run only by a trusted database administrator, directly against the live
Supabase project, never through the application.**

## Important gotcha: the trigger fires even in the SQL Editor

`auth.uid()` reads the current request's JWT claim. A raw connection from the Supabase SQL
Editor (or `psql`, or `db-url`) has no JWT set, so `auth.uid()` evaluates to `NULL` there —
which means the trigger's own admin/superadmin check finds **no** matching row and **raises
the exception anyway**, blocking a plain `UPDATE public.profiles SET platform_role = ...`
even for a Postgres superuser connection. Disable the trigger for the single statement, then
re-enable it immediately — never leave it disabled.

## Grant a platform role

Run against the target project (`cwcmjtglxyojsjzvunsf` for this deployment) via the Supabase
Dashboard's SQL Editor, or a direct `psql`/`--db-url` connection as `postgres`:

```sql
begin;

alter table public.profiles disable trigger trg_profiles_platform_role_guard;

update public.profiles
set platform_role = 'superadmin'  -- one of: 'moderator' | 'admin' | 'superadmin'
where id = '00000000-0000-0000-0000-000000000000';  -- replace with the target user's auth.users id

alter table public.profiles enable trigger trg_profiles_platform_role_guard;

commit;
```

Find the target user's id first if you only know their email:

```sql
select id, email from public.profiles where email = 'operator@example.com';
```

## Verify

```sql
select id, email, platform_role from public.profiles where id = '00000000-0000-0000-0000-000000000000';
```

Expect `platform_role` to show the value you set. Also confirm the trigger is back on:

```sql
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.profiles'::regclass and tgname = 'trg_profiles_platform_role_guard';
```

`tgenabled` should read `O` (origin — enabled), not `D` (disabled).

## Rollback (revoke)

```sql
begin;

alter table public.profiles disable trigger trg_profiles_platform_role_guard;

update public.profiles
set platform_role = null
where id = '00000000-0000-0000-0000-000000000000';

alter table public.profiles enable trigger trg_profiles_platform_role_guard;

commit;
```

## After the first admin/superadmin exists

Once at least one `admin` or `superadmin` profile exists, that operator can grant further
platform roles the same way (the trigger's own check passes for them when acting through
the app's normal authenticated session) — but no in-app UI to do so has been built as of
Milestone 12. Granting additional platform roles still requires running the same SQL above
(minus the disable/enable dance, if done as that already-privileged user through a
session-authenticated connection where `auth.uid()` resolves correctly) until a dedicated
admin screen is built. Treat this document as the standing procedure until then.

## Warning

- Never run this against a project with real tenant data without confirming the target
  project ref first.
- Never leave the trigger disabled outside the single transaction above.
- `superadmin` is the highest-privilege role in the system (plan catalog writes, platform
  settings, and every `admin` capability) — grant it only to operators who need full platform
  control.
