-- New permissions for Milestone 3. See docs/rbac.md for the full matrix and
-- reasoning. None of these duplicate an existing M1/M2 permission — the
-- hotel-level `schedules.*`/`holidays.*` permissions govern hotel business
-- hours, a distinct concept from an individual agent's own schedule.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('ai_agents.read', 'ai_agents', 'View AI agents and their configuration', true),
  ('ai_agents.create', 'ai_agents', 'Create a new AI agent', false),
  ('ai_agents.update', 'ai_agents', 'Edit an AI agent''s core profile fields', false),
  ('ai_agents.activate', 'ai_agents', 'Activate or deactivate an AI agent', false),
  ('ai_agents.archive', 'ai_agents', 'Archive an AI agent', false),
  ('ai_agents.test', 'ai_agents', 'Use the AI agent test playground', false),
  ('ai_agents.manage_languages', 'ai_agents', 'Manage an AI agent''s enabled languages', false),
  ('ai_agents.manage_capabilities', 'ai_agents', 'Manage an AI agent''s capabilities', false),
  ('ai_agents.manage_schedules', 'ai_agents', 'Manage an AI agent''s schedule', false),
  ('ai_agents.manage_handoff', 'ai_agents', 'Manage an AI agent''s human handoff rules', false),
  ('ai_agents.manage_policies', 'ai_agents', 'Manage an AI agent''s approval policies', false),
  ('ai_agents.manage_prompts', 'ai_agents', 'Edit an AI agent''s prompt content', false),
  ('ai_agents.restore_prompt_version', 'ai_agents', 'Restore an AI agent to a prior prompt version', false);

insert into public.role_permissions (role_key, permission_key) values
  -- Receptionist: view agent status only.
  ('receptionist', 'ai_agents.read'),

  -- Reception Manager: view and test; no configuration management by
  -- default (the brief's "if granted" is not yet backed by a per-user
  -- permission override UI, so the baseline omits it).
  ('reception_manager', 'ai_agents.read'),
  ('reception_manager', 'ai_agents.test'),

  -- Reception Managers Manager: full day-to-day agent operations, but not
  -- archive or approval-policy governance (reserved for GM/Owner, matching
  -- the M2 precedent of restricting hotel-wide config to that audience).
  ('reception_managers_manager', 'ai_agents.read'),
  ('reception_managers_manager', 'ai_agents.test'),
  ('reception_managers_manager', 'ai_agents.create'),
  ('reception_managers_manager', 'ai_agents.update'),
  ('reception_managers_manager', 'ai_agents.activate'),
  ('reception_managers_manager', 'ai_agents.manage_languages'),
  ('reception_managers_manager', 'ai_agents.manage_capabilities'),
  ('reception_managers_manager', 'ai_agents.manage_schedules'),
  ('reception_managers_manager', 'ai_agents.manage_handoff'),
  ('reception_managers_manager', 'ai_agents.manage_prompts'),
  ('reception_managers_manager', 'ai_agents.restore_prompt_version'),

  -- Hotel General Manager & Hotel Owner: full management, including archive
  -- and approval policy governance.
  ('hotel_general_manager', 'ai_agents.read'),
  ('hotel_general_manager', 'ai_agents.test'),
  ('hotel_general_manager', 'ai_agents.create'),
  ('hotel_general_manager', 'ai_agents.update'),
  ('hotel_general_manager', 'ai_agents.activate'),
  ('hotel_general_manager', 'ai_agents.archive'),
  ('hotel_general_manager', 'ai_agents.manage_languages'),
  ('hotel_general_manager', 'ai_agents.manage_capabilities'),
  ('hotel_general_manager', 'ai_agents.manage_schedules'),
  ('hotel_general_manager', 'ai_agents.manage_handoff'),
  ('hotel_general_manager', 'ai_agents.manage_policies'),
  ('hotel_general_manager', 'ai_agents.manage_prompts'),
  ('hotel_general_manager', 'ai_agents.restore_prompt_version'),

  ('hotel_owner', 'ai_agents.read'),
  ('hotel_owner', 'ai_agents.test'),
  ('hotel_owner', 'ai_agents.create'),
  ('hotel_owner', 'ai_agents.update'),
  ('hotel_owner', 'ai_agents.activate'),
  ('hotel_owner', 'ai_agents.archive'),
  ('hotel_owner', 'ai_agents.manage_languages'),
  ('hotel_owner', 'ai_agents.manage_capabilities'),
  ('hotel_owner', 'ai_agents.manage_schedules'),
  ('hotel_owner', 'ai_agents.manage_handoff'),
  ('hotel_owner', 'ai_agents.manage_policies'),
  ('hotel_owner', 'ai_agents.manage_prompts'),
  ('hotel_owner', 'ai_agents.restore_prompt_version');

-- Platform Moderator gets read-only access via platform_moderator_can_read
-- above (consistent with every other M1/M2 read permission). Platform
-- Admin/Superadmin get unconditional access via has_permission()'s existing
-- platform-role bypass — no role_permissions rows needed for them.
