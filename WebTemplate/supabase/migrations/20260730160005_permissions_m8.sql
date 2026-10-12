-- New permissions for Milestone 8 (Voice). Call metadata includes phone
-- numbers, so `calls.read`/`calls.manage` follow the M5/M6 PII stance
-- (withheld from Platform Moderator). `voice.manage` is pure hotel-wide
-- configuration (enabled flag, phone number placeholder, default agent) with
-- no PII, so it follows the `booking.manage`/`pms.read` precedent instead.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('voice.manage', 'voice', 'Configure voice: enable/disable, phone number, default AI agent', true),
  ('calls.read', 'calls', 'View call history and events', false),
  ('calls.manage', 'calls', 'Annotate calls and mark handoffs completed', false);

insert into public.role_permissions (role_key, permission_key) values
  ('receptionist', 'calls.read'),
  ('receptionist', 'calls.manage'),

  ('reception_manager', 'calls.read'),
  ('reception_manager', 'calls.manage'),

  ('reception_managers_manager', 'voice.manage'),
  ('reception_managers_manager', 'calls.read'),
  ('reception_managers_manager', 'calls.manage'),

  ('hotel_general_manager', 'voice.manage'),
  ('hotel_general_manager', 'calls.read'),
  ('hotel_general_manager', 'calls.manage'),

  ('hotel_owner', 'voice.manage'),
  ('hotel_owner', 'calls.read'),
  ('hotel_owner', 'calls.manage');
