-- Shared helper for conversation child tables: derives organization_id/hotel_id
-- from the parent conversation, same pattern as set_ai_agent_child_scope().
create or replace function public.set_conversation_child_scope()
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
  from public.conversations where id = new.conversation_id;

  if v_hotel_id is null then
    raise exception 'conversations.id % not found', new.conversation_id;
  end if;

  new.hotel_id := v_hotel_id;
  new.organization_id := v_org_id;
  return new;
end;
$$;

-- Individual messages in a conversation. Immutable once written (the skeleton
-- has no edit/delete). delivery_status is a foundation for a future provider
-- that reports delivery — in M5 outbound messages are simply stored as 'sent'
-- and nothing is actually transmitted anywhere.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('guest', 'user', 'ai', 'system')),
  sender_membership_id uuid references public.memberships (id) on delete set null,
  sender_ai_agent_id uuid references public.ai_agents (id) on delete set null,
  body text not null,
  delivery_status text not null default 'sent'
    check (delivery_status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  external_message_id text,
  created_at timestamptz not null default now()
);

comment on table public.messages is 'Skeleton messages. Nothing is transmitted to any provider — outbound rows are stored as ''sent''. Immutable in M5.';

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_hotel_idx on public.messages (hotel_id);

create trigger trg_messages_set_scope
  before insert on public.messages
  for each row execute function public.set_conversation_child_scope();

alter table public.messages enable row level security;

create policy "messages_select_permission"
  on public.messages for select
  using (public.has_permission(auth.uid(), 'inbox.view', hotel_id, organization_id));

create policy "messages_insert_permission"
  on public.messages for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'inbox.send', hotel_id, organization_id));
