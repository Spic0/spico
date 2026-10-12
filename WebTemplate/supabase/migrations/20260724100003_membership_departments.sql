-- Assigns a hotel-scoped membership to one or more departments. organization_id
-- /hotel_id are derived automatically from the membership by trigger (never
-- trusted from the caller) so they can't drift from the membership's actual
-- scope, and a mismatched hotel/department pairing is rejected outright.

create table public.membership_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (membership_id, department_id)
);

comment on table public.membership_departments is 'Which hotel department(s) a membership belongs to. Only hotel-scoped memberships (hotel_id not null) can be assigned.';

create index membership_departments_membership_idx on public.membership_departments (membership_id);
create index membership_departments_department_idx on public.membership_departments (department_id);
create index membership_departments_hotel_idx on public.membership_departments (hotel_id);

create or replace function public.set_membership_department_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_hotel_id uuid;
  v_membership_org_id uuid;
  v_department_hotel_id uuid;
begin
  select hotel_id, organization_id into v_membership_hotel_id, v_membership_org_id
  from public.memberships where id = new.membership_id;

  if v_membership_hotel_id is null then
    raise exception 'Only hotel-scoped memberships can be assigned to a department';
  end if;

  select hotel_id into v_department_hotel_id
  from public.departments where id = new.department_id;

  if v_department_hotel_id is distinct from v_membership_hotel_id then
    raise exception 'Department does not belong to the same hotel as the membership';
  end if;

  new.hotel_id := v_membership_hotel_id;
  new.organization_id := v_membership_org_id;
  return new;
end;
$$;

create trigger trg_membership_departments_set_scope
  before insert on public.membership_departments
  for each row execute function public.set_membership_department_scope();

alter table public.membership_departments enable row level security;

create policy "membership_departments_select_permission"
  on public.membership_departments for select
  using (public.has_permission(auth.uid(), 'team.view', hotel_id, organization_id));

create policy "membership_departments_insert_permission"
  on public.membership_departments for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'team.departments.assign', hotel_id, organization_id));

create policy "membership_departments_delete_permission"
  on public.membership_departments for delete
  using (public.has_permission(auth.uid(), 'team.departments.assign', hotel_id, organization_id));
