-- New permissions for Milestone 11 (PMS completion: housekeeping, folio &
-- billing, channel manager sync, seasonal rates). Channel-manager sync
-- reuses the existing `integrations.read`/`integrations.manage` (M9) —
-- triggering a sync is just another integration action, no new permission
-- needed. Seasonal rates reuse the existing `pms.read`/`pms.manage` (M6) —
-- rate_plan_seasons is part of "Rooms & Rates" configuration.
--
-- folio.*/housekeeping.* are granted at the Receptionist base level, same as
-- M6's guests.*/reservations.* — recording a payment, adding a charge, and
-- managing the housekeeping board are core daily front-desk work, not
-- manager-tier configuration.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('folio.read', 'pms', 'View guest folios, charges, and payments', false),
  ('folio.manage', 'pms', 'Add folio charges and record payments', false),
  ('housekeeping.read', 'pms', 'View the housekeeping task board', true),
  ('housekeeping.manage', 'pms', 'Create, assign, and update housekeeping tasks', false);

insert into public.role_permissions (role_key, permission_key) values
  ('receptionist', 'folio.read'),
  ('receptionist', 'folio.manage'),
  ('receptionist', 'housekeeping.read'),
  ('receptionist', 'housekeeping.manage'),

  ('reception_manager', 'folio.read'),
  ('reception_manager', 'folio.manage'),
  ('reception_manager', 'housekeeping.read'),
  ('reception_manager', 'housekeeping.manage'),

  ('reception_managers_manager', 'folio.read'),
  ('reception_managers_manager', 'folio.manage'),
  ('reception_managers_manager', 'housekeeping.read'),
  ('reception_managers_manager', 'housekeeping.manage'),

  ('hotel_general_manager', 'folio.read'),
  ('hotel_general_manager', 'folio.manage'),
  ('hotel_general_manager', 'housekeeping.read'),
  ('hotel_general_manager', 'housekeeping.manage'),

  ('hotel_owner', 'folio.read'),
  ('hotel_owner', 'folio.manage'),
  ('hotel_owner', 'housekeeping.read'),
  ('hotel_owner', 'housekeeping.manage');
