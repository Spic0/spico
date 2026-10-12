-- demo_data.manage is added to the permission catalog for visibility in
-- rbac.md/any future permission-listing UI, but it is DELIBERATELY NOT used
-- via the standard has_permission()/requirePermission() path anywhere in the
-- app. has_permission() grants a universal bypass to BOTH platform_role
-- 'admin' AND 'superadmin' (see 20260723090009_policies.sql) — this feature
-- must be Hotel Owner + Platform Superadmin ONLY, excluding Platform Admin,
-- so the app instead uses a dedicated check (lib/demoData.ts's
-- requireOwnerOrSuperadmin()) that never calls has_permission(). This row
-- exists purely as documentation/reference data. See docs/rbac.md Milestone
-- 12 section for the full reasoning — do not copy this pattern for a normal
-- permission without re-reading it first.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('demo_data.manage', 'demo_data', 'Seed or remove internal test data for a hotel (Hotel Owner + Platform Superadmin only — enforced outside has_permission(), see docs/rbac.md)', false);

insert into public.role_permissions (role_key, permission_key) values
  ('hotel_owner', 'demo_data.manage');
