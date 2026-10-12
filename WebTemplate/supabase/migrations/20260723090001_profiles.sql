-- Profiles: 1:1 mirror of auth.users, plus platform-level role.
-- Platform roles (moderator/admin/superadmin) are NOT tenant memberships:
-- they operate across every organization/hotel. See docs/rbac.md.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  platform_role text check (platform_role in ('moderator', 'admin', 'superadmin')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'App-owned user profile, 1:1 with auth.users. platform_role is independent of org/hotel memberships.';

-- Security-definer helper: safe to call from RLS policies on other tables
-- without triggering recursive RLS evaluation on profiles itself.
create or replace function public.is_platform_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and platform_role is not null
  );
$$;

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent privilege escalation: a user updating their own profile row must
-- not be able to grant themselves a platform role. Only an existing platform
-- admin/superadmin (acting through server-side code) may change platform_role.
create or replace function public.prevent_unauthorized_platform_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.platform_role is distinct from old.platform_role then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and platform_role in ('admin', 'superadmin')
    ) then
      raise exception 'Only a platform admin or superadmin may change platform_role';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_platform_role_guard
  before update on public.profiles
  for each row execute function public.prevent_unauthorized_platform_role_change();

alter table public.profiles enable row level security;

create policy "profiles_select_self_or_platform"
  on public.profiles for select
  using (
    id = auth.uid()
    or public.is_platform_user(auth.uid())
  );

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
