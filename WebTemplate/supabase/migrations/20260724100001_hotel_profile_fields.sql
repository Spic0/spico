-- Hotel Profile & Settings (Milestone 2). Extends the existing `hotels` table
-- rather than introducing a parallel 1:1 table — these are just more
-- attributes of the same entity. Reuses the M1 `hotel.settings.manage`
-- permission for both read and write of this page (see docs/rbac.md — no
-- role needs read-only access without also having manage today).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.hotels
  add column updated_at timestamptz not null default now(),
  add column description text,
  add column hotel_type text
    check (hotel_type is null or hotel_type in ('hotel', 'resort', 'boutique', 'hostel', 'apartment', 'guesthouse', 'other')),
  add column star_rating smallint check (star_rating is null or star_rating between 1 and 5),
  add column logo_url text,
  add column cover_image_url text,
  add column address_line1 text,
  add column city text,
  add column country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column postal_code text,
  add column default_currency text not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  add column default_locale text not null default 'en' check (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  add column contact_email text,
  add column contact_phone text,
  add column website_url text,
  add column check_in_time time not null default '15:00',
  add column check_out_time time not null default '11:00',
  add column default_guest_language text,
  add constraint hotels_default_guest_language_is_supported check (
    default_guest_language is null or languages @> to_jsonb(default_guest_language)
  );

comment on column public.hotels.languages is 'Up to 10 configured guest-facing language codes (see hotels_languages_is_array_of_at_most_10). default_guest_language must be one of these.';

create trigger trg_hotels_set_updated_at
  before update on public.hotels
  for each row execute function public.set_updated_at();
