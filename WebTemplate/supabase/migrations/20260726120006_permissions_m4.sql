-- New permissions for Milestone 4 (Knowledge Base). See docs/rbac.md for the
-- full matrix and reasoning. `ai_agents.manage_knowledge` lives in the
-- ai_agents module because assigning knowledge sources is agent configuration,
-- even though the content it points at is governed by the kb.* permissions.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('kb.read', 'knowledge_base', 'View knowledge base categories, articles, and documents', true),
  ('kb.categories.manage', 'knowledge_base', 'Create and manage knowledge base categories', false),
  ('kb.articles.manage', 'knowledge_base', 'Create and manage knowledge base articles', false),
  ('kb.documents.manage', 'knowledge_base', 'Upload, link, and manage knowledge base documents', false),
  ('ai_agents.manage_knowledge', 'ai_agents', 'Assign knowledge base sources to an AI agent', false);

insert into public.role_permissions (role_key, permission_key) values
  -- Receptionist: read the knowledge base only.
  ('receptionist', 'kb.read'),

  -- Reception Manager: read only (consistent with M3, where this role does not
  -- get configuration management without a per-user override that has no UI yet).
  ('reception_manager', 'kb.read'),

  -- Reception Managers Manager: full day-to-day knowledge management, including
  -- assigning knowledge to agents (mirrors its M3 agent-operations grant).
  ('reception_managers_manager', 'kb.read'),
  ('reception_managers_manager', 'kb.categories.manage'),
  ('reception_managers_manager', 'kb.articles.manage'),
  ('reception_managers_manager', 'kb.documents.manage'),
  ('reception_managers_manager', 'ai_agents.manage_knowledge'),

  ('hotel_general_manager', 'kb.read'),
  ('hotel_general_manager', 'kb.categories.manage'),
  ('hotel_general_manager', 'kb.articles.manage'),
  ('hotel_general_manager', 'kb.documents.manage'),
  ('hotel_general_manager', 'ai_agents.manage_knowledge'),

  ('hotel_owner', 'kb.read'),
  ('hotel_owner', 'kb.categories.manage'),
  ('hotel_owner', 'kb.articles.manage'),
  ('hotel_owner', 'kb.documents.manage'),
  ('hotel_owner', 'ai_agents.manage_knowledge');

-- Platform Moderator gets read-only kb.read via platform_moderator_can_read
-- above. Platform Admin/Superadmin get access via has_permission()'s existing
-- platform-role bypass — no role_permissions rows needed.
