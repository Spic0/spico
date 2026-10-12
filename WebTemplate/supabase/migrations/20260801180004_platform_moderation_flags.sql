-- Moderation tooling for Platform Moderator. Until this milestone, Moderator
-- was read-only everywhere (platform_moderator_can_read on config
-- permissions) with no actionable capability of its own. This gives it one:
-- raise a flag against an organization or hotel for an admin/superadmin to
-- review and act on (e.g. suspend). Moderator can read and create flags;
-- only admin/superadmin can resolve one — mirrors real moderation workflows
-- (mods flag, admins act) and keeps Moderator unable to take the actual
-- suspend/reactivate action itself (still admin+superadmin-only, unchanged
-- from M1).

create table public.platform_moderation_flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('organization', 'hotel')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  raised_by uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

comment on table public.platform_moderation_flags is 'target_id references organizations.id or hotels.id depending on target_type — not a DB-enforced FK (would need two nullable FKs or a polymorphic check); validated in the server action instead.';

create index platform_moderation_flags_status_idx on public.platform_moderation_flags (status, created_at desc);
create index platform_moderation_flags_target_idx on public.platform_moderation_flags (target_type, target_id);

alter table public.platform_moderation_flags enable row level security;

create policy "platform_moderation_flags_select_permission"
  on public.platform_moderation_flags for select
  using (public.is_platform_user(auth.uid()));

create policy "platform_moderation_flags_insert_permission"
  on public.platform_moderation_flags for insert
  to authenticated
  with check (public.is_platform_user(auth.uid()) and raised_by = auth.uid());

create policy "platform_moderation_flags_resolve_permission"
  on public.platform_moderation_flags for update
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and platform_role in ('admin', 'superadmin')))
  with check (exists (select 1 from public.profiles where id = auth.uid() and platform_role in ('admin', 'superadmin')));
