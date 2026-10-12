-- New permissions for Milestone 6 (Reservations & PMS). Guest and reservation
-- data is PII, so `guests.read`/`reservations.read` are NOT granted to Platform
-- Moderator (same stance as inbox in M5). `pms.read` (room inventory config, not
-- PII) keeps the moderator read grant consistent with other config permissions.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('pms.read', 'pms', 'View room types, rooms, and rate plans', true),
  ('pms.manage', 'pms', 'Manage room types, rooms, and rate plans', false),
  ('guests.read', 'pms', 'View guest profiles', false),
  ('guests.manage', 'pms', 'Create and edit guest profiles', false),
  ('reservations.read', 'pms', 'View reservations', false),
  ('reservations.manage', 'pms', 'Create, modify, check in/out, and cancel reservations', false);

insert into public.role_permissions (role_key, permission_key) values
  -- Receptionist: full front-desk operations (guests + reservations), read-only
  -- on the room inventory configuration.
  ('receptionist', 'pms.read'),
  ('receptionist', 'guests.read'),
  ('receptionist', 'guests.manage'),
  ('receptionist', 'reservations.read'),
  ('receptionist', 'reservations.manage'),

  ('reception_manager', 'pms.read'),
  ('reception_manager', 'guests.read'),
  ('reception_manager', 'guests.manage'),
  ('reception_manager', 'reservations.read'),
  ('reception_manager', 'reservations.manage'),

  -- Reception Managers Manager: also configures the room inventory.
  ('reception_managers_manager', 'pms.read'),
  ('reception_managers_manager', 'pms.manage'),
  ('reception_managers_manager', 'guests.read'),
  ('reception_managers_manager', 'guests.manage'),
  ('reception_managers_manager', 'reservations.read'),
  ('reception_managers_manager', 'reservations.manage'),

  ('hotel_general_manager', 'pms.read'),
  ('hotel_general_manager', 'pms.manage'),
  ('hotel_general_manager', 'guests.read'),
  ('hotel_general_manager', 'guests.manage'),
  ('hotel_general_manager', 'reservations.read'),
  ('hotel_general_manager', 'reservations.manage'),

  ('hotel_owner', 'pms.read'),
  ('hotel_owner', 'pms.manage'),
  ('hotel_owner', 'guests.read'),
  ('hotel_owner', 'guests.manage'),
  ('hotel_owner', 'reservations.read'),
  ('hotel_owner', 'reservations.manage');
