-- Milestone 12 safe demo/test-data seeding: a queryable, DB-level tag on
-- every table the seeding tool writes to. Chosen over a naming/notes
-- convention because a boolean column is reliably queryable/indexable and
-- can't be spoofed or collide with a real hotel operator's own naming — the
-- same reasoning as every other lifecycle flag in this schema (status,
-- processing_status). "Remove Test Data" (20260803100003) filters on this
-- column exclusively, so it can never delete a manually created row.

alter table public.room_types add column is_test_data boolean not null default false;
alter table public.rooms add column is_test_data boolean not null default false;
alter table public.rate_plans add column is_test_data boolean not null default false;
alter table public.guests add column is_test_data boolean not null default false;
alter table public.reservations add column is_test_data boolean not null default false;
alter table public.ai_agents add column is_test_data boolean not null default false;
alter table public.kb_categories add column is_test_data boolean not null default false;
alter table public.kb_articles add column is_test_data boolean not null default false;
alter table public.channels add column is_test_data boolean not null default false;
alter table public.conversations add column is_test_data boolean not null default false;
alter table public.messages add column is_test_data boolean not null default false;
alter table public.booking_settings add column is_test_data boolean not null default false;

create index room_types_is_test_data_idx on public.room_types (hotel_id) where is_test_data;
create index rooms_is_test_data_idx on public.rooms (hotel_id) where is_test_data;
create index rate_plans_is_test_data_idx on public.rate_plans (hotel_id) where is_test_data;
create index guests_is_test_data_idx on public.guests (hotel_id) where is_test_data;
create index reservations_is_test_data_idx on public.reservations (hotel_id) where is_test_data;
create index ai_agents_is_test_data_idx on public.ai_agents (hotel_id) where is_test_data;
create index kb_categories_is_test_data_idx on public.kb_categories (hotel_id) where is_test_data;
create index kb_articles_is_test_data_idx on public.kb_articles (hotel_id) where is_test_data;
create index channels_is_test_data_idx on public.channels (hotel_id) where is_test_data;
create index conversations_is_test_data_idx on public.conversations (hotel_id) where is_test_data;
create index messages_is_test_data_idx on public.messages (hotel_id) where is_test_data;
create index booking_settings_is_test_data_idx on public.booking_settings (hotel_id) where is_test_data;

comment on column public.room_types.is_test_data is 'Set only by seed_hotel_test_data(). remove_hotel_test_data() deletes exclusively rows where this is true — never a manually created row.';
