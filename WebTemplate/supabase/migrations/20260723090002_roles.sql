-- Reference table of hotel/organization roles. Platform roles are not here —
-- they live on profiles.platform_role. See docs/rbac.md.

create table public.roles (
  key text primary key,
  label text not null,
  rank integer not null
);

comment on table public.roles is 'Hotel/organization-scoped roles assignable via memberships. Platform roles are separate (profiles.platform_role).';

insert into public.roles (key, label, rank) values
  ('receptionist', 'Receptionist', 1),
  ('reception_manager', 'Reception Manager', 2),
  ('reception_managers_manager', 'Reception Managers Manager', 3),
  ('hotel_general_manager', 'Hotel General Manager', 4),
  ('hotel_owner', 'Hotel Owner', 5);

alter table public.roles enable row level security;

create policy "roles_select_authenticated"
  on public.roles for select
  to authenticated
  using (true);
