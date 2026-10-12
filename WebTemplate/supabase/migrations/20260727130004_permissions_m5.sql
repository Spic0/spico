-- New permissions for Milestone 5 (Omnichannel Inbox). Conversations carry
-- guest content/PII, so `inbox.view` is NOT granted to Platform Moderator by
-- default (platform_moderator_can_read = false) — unlike the config-oriented
-- read permissions in M1–M4. Platform Admin/Superadmin still reach everything
-- via has_permission()'s platform-role bypass.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('inbox.view', 'inbox', 'View inbox channels, conversations, and messages', false),
  ('inbox.send', 'inbox', 'Send a message / compose a conversation', false),
  ('inbox.manage', 'inbox', 'Assign, prioritize, and change conversation status', false),
  ('channels.manage', 'inbox', 'Configure inbox channels', false);

insert into public.role_permissions (role_key, permission_key) values
  -- Receptionist: front-line handling — read and reply.
  ('receptionist', 'inbox.view'),
  ('receptionist', 'inbox.send'),

  -- Reception Manager: also triage (assign/status/priority).
  ('reception_manager', 'inbox.view'),
  ('reception_manager', 'inbox.send'),
  ('reception_manager', 'inbox.manage'),

  -- Reception Managers Manager: also configure channels.
  ('reception_managers_manager', 'inbox.view'),
  ('reception_managers_manager', 'inbox.send'),
  ('reception_managers_manager', 'inbox.manage'),
  ('reception_managers_manager', 'channels.manage'),

  ('hotel_general_manager', 'inbox.view'),
  ('hotel_general_manager', 'inbox.send'),
  ('hotel_general_manager', 'inbox.manage'),
  ('hotel_general_manager', 'channels.manage'),

  ('hotel_owner', 'inbox.view'),
  ('hotel_owner', 'inbox.send'),
  ('hotel_owner', 'inbox.manage'),
  ('hotel_owner', 'channels.manage');
