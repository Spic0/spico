-- Platform-wide configuration. Deliberately a single row (fixed, known id) —
-- not org/hotel-scoped, there is exactly one of these for the whole
-- deployment. Readable by any authenticated user (platform name/support
-- email/announcement are meant to be visible app-wide); writable by
-- admin/superadmin, matching the tier already used for org suspend
-- (requirePlatformRole(["admin","superadmin"])) in app/(app)/admin/actions.ts.

create table public.platform_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  platform_name text not null default 'Spico',
  support_email text,
  default_currency text not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  maintenance_mode boolean not null default false,
  announcement_message text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint platform_settings_is_singleton check (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

comment on table public.platform_settings is 'Singleton row (fixed id) — platform-wide configuration. maintenance_mode/announcement_message are not yet read by any page (foundation only, see docs/assumptions.md M10).';

create trigger trg_platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (id) values ('00000000-0000-0000-0000-000000000001'::uuid);

alter table public.platform_settings enable row level security;

create policy "platform_settings_select_authenticated"
  on public.platform_settings for select
  to authenticated
  using (true);

create policy "platform_settings_update_permission"
  on public.platform_settings for update
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and platform_role in ('admin', 'superadmin')))
  with check (exists (select 1 from public.profiles where id = auth.uid() and platform_role in ('admin', 'superadmin')));
