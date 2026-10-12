-- New permissions for Milestone 9 (Integrations, API keys, webhooks). This
-- surface is back-office/technical, not a daily front-desk concern, so
-- `integrations.read` starts at Reception Managers Manager (not Receptionist/
-- Reception Manager, unlike most M6/M7 read grants). The *manage* actions
-- (issuing API keys, configuring webhooks/connectors) are GM/Owner-only,
-- matching the governance-level bar set in M3 for `ai_agents.archive`/
-- `manage_policies` — a leaked API key or a malicious webhook URL has a much
-- higher blast radius than typical hotel-wide configuration.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('integrations.read', 'integrations', 'View API keys, webhooks, and connector configuration (not key/secret material)', true),
  ('api_keys.manage', 'integrations', 'Issue and revoke Open API keys', false),
  ('webhooks.manage', 'integrations', 'Create, edit, and disable webhook subscriptions', false),
  ('integrations.manage', 'integrations', 'Configure PMS/CRM/calendar/channel-manager connectors', false);

insert into public.role_permissions (role_key, permission_key) values
  ('reception_managers_manager', 'integrations.read'),

  ('hotel_general_manager', 'integrations.read'),
  ('hotel_general_manager', 'api_keys.manage'),
  ('hotel_general_manager', 'webhooks.manage'),
  ('hotel_general_manager', 'integrations.manage'),

  ('hotel_owner', 'integrations.read'),
  ('hotel_owner', 'api_keys.manage'),
  ('hotel_owner', 'webhooks.manage'),
  ('hotel_owner', 'integrations.manage');
