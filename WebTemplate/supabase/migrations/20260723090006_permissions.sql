-- Permission catalog and role -> permission grants, matching the matrix in
-- docs/rbac.md. Reference data: safe for any authenticated user to read
-- (needed by the UI to know what a role can do), never sensitive.

create table public.permissions (
  key text primary key,
  module text not null,
  description text not null,
  -- Whether Platform Moderator gets read access to this permission without
  -- an explicit membership grant (moderators are read-only across tenants).
  platform_moderator_can_read boolean not null default false
);

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('dashboard.view', 'dashboard', 'View the hotel/org dashboard', true),
  ('team.view', 'team', 'View team members and their roles', true),
  ('team.manage', 'team', 'Invite, change role, or revoke team members', false),
  ('hotel.settings.manage', 'settings', 'Manage organization/hotel settings', false),
  ('audit_log.view', 'audit_log', 'View the audit log', true),
  ('platform.admin', 'platform', 'Access platform administration (orgs, suspensions, global config)', false);

insert into public.role_permissions (role_key, permission_key) values
  ('receptionist', 'dashboard.view'),
  ('reception_manager', 'dashboard.view'),
  ('reception_manager', 'team.view'),
  ('reception_managers_manager', 'dashboard.view'),
  ('reception_managers_manager', 'team.view'),
  ('reception_managers_manager', 'audit_log.view'),
  ('hotel_general_manager', 'dashboard.view'),
  ('hotel_general_manager', 'team.view'),
  ('hotel_general_manager', 'team.manage'),
  ('hotel_general_manager', 'hotel.settings.manage'),
  ('hotel_general_manager', 'audit_log.view'),
  ('hotel_owner', 'dashboard.view'),
  ('hotel_owner', 'team.view'),
  ('hotel_owner', 'team.manage'),
  ('hotel_owner', 'hotel.settings.manage'),
  ('hotel_owner', 'audit_log.view');

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy "permissions_select_authenticated"
  on public.permissions for select
  to authenticated
  using (true);

create policy "role_permissions_select_authenticated"
  on public.role_permissions for select
  to authenticated
  using (true);
