-- Shared helper for folio child tables: derives organization_id/hotel_id from
-- the parent folio, same pattern as set_ai_agent_child_scope() /
-- set_conversation_child_scope() / set_call_child_scope() / set_webhook_child_scope().
create or replace function public.set_folio_child_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_org_id uuid;
begin
  select hotel_id, organization_id into v_hotel_id, v_org_id
  from public.folios where id = new.folio_id;

  if v_hotel_id is null then
    raise exception 'folios.id % not found', new.folio_id;
  end if;

  new.hotel_id := v_hotel_id;
  new.organization_id := v_org_id;
  return new;
end;
$$;

-- Individual charges on a folio. amount is a generated column (quantity *
-- unit_amount) so it can never drift from its inputs. service_date is the
-- night/date a charge applies to (null for non-dated charges like a one-off
-- adjustment).
create table public.folio_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  folio_id uuid not null references public.folios (id) on delete cascade,
  category text not null check (category in ('room', 'tax', 'extra', 'adjustment')),
  description text not null,
  service_date date,
  quantity smallint not null default 1 check (quantity > 0),
  unit_amount numeric(12, 2) not null,
  amount numeric(12, 2) generated always as (quantity * unit_amount) stored,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.folio_line_items is 'Folio charges. category=room rows are auto-created (one per night) by create_reservation_folio(); tax/extra/adjustment are typically staff-added.';

create index folio_line_items_folio_idx on public.folio_line_items (folio_id, service_date);
create index folio_line_items_hotel_idx on public.folio_line_items (hotel_id);

create trigger trg_folio_line_items_set_scope
  before insert on public.folio_line_items
  for each row execute function public.set_folio_child_scope();

alter table public.folio_line_items enable row level security;

create policy "folio_line_items_select_permission"
  on public.folio_line_items for select
  using (public.has_permission(auth.uid(), 'folio.read', hotel_id, organization_id));

create policy "folio_line_items_insert_permission"
  on public.folio_line_items for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id));

create policy "folio_line_items_delete_permission"
  on public.folio_line_items for delete
  using (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id));
