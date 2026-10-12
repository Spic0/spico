-- New permissions for Milestone 10. billing.read/billing.manage are
-- ORGANIZATION-scoped (not hotel-scoped) — billing is inherently an
-- org-wide concern, matching how team.view/manage and audit_log.view work.
-- Granted to Hotel Owner ONLY, not Hotel General Manager — the first
-- hotel-wide-config permission in the project withheld from GM. Billing is
-- more owner-exclusive in practice than API keys/webhooks (M9, GM+Owner) or
-- voice/booking config (M7/M8, Reception Managers Manager+): a plan change
-- has direct financial consequences for the organization, which real SaaS
-- products near-universally reserve for the account owner.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('billing.read', 'billing', 'View the organization''s subscription plan and billing status', true),
  ('billing.manage', 'billing', 'Change the organization''s subscription plan', false);

insert into public.role_permissions (role_key, permission_key) values
  ('hotel_owner', 'billing.read'),
  ('hotel_owner', 'billing.manage');
