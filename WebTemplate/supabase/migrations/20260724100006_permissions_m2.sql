-- New permissions for Milestone 2. Reuses existing M1 permissions where they
-- already cover the need (hotel.settings.manage for hotel profile writes,
-- audit_log.view for audit visibility) rather than duplicating them — see
-- docs/rbac.md.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('departments.read', 'departments', 'View hotel departments', true),
  ('departments.manage', 'departments', 'Create, edit, activate, or deactivate hotel departments', false),
  ('schedules.read', 'schedules', 'View hotel business hours', true),
  ('schedules.manage', 'schedules', 'Manage hotel business hours', false),
  ('holidays.read', 'schedules', 'View hotel holidays/exceptions', true),
  ('holidays.manage', 'schedules', 'Manage hotel holidays/exceptions', false),
  ('team.departments.assign', 'team', 'Assign or unassign a team member''s hotel department(s)', false);

insert into public.role_permissions (role_key, permission_key) values
  -- Departments: everyone can view; Receptionist cannot manage.
  ('receptionist', 'departments.read'),
  ('reception_manager', 'departments.read'),
  ('reception_manager', 'departments.manage'),
  ('reception_managers_manager', 'departments.read'),
  ('reception_managers_manager', 'departments.manage'),
  ('hotel_general_manager', 'departments.read'),
  ('hotel_general_manager', 'departments.manage'),
  ('hotel_owner', 'departments.read'),
  ('hotel_owner', 'departments.manage'),

  -- Business hours & holidays: view is broad, manage restricted to GM/Owner
  -- (same audience as hotel.settings.manage — these are hotel-wide config
  -- that will later drive AI scheduling, not day-to-day reception work).
  ('receptionist', 'schedules.read'),
  ('receptionist', 'holidays.read'),
  ('reception_manager', 'schedules.read'),
  ('reception_manager', 'holidays.read'),
  ('reception_managers_manager', 'schedules.read'),
  ('reception_managers_manager', 'holidays.read'),
  ('hotel_general_manager', 'schedules.read'),
  ('hotel_general_manager', 'schedules.manage'),
  ('hotel_general_manager', 'holidays.read'),
  ('hotel_general_manager', 'holidays.manage'),
  ('hotel_owner', 'schedules.read'),
  ('hotel_owner', 'schedules.manage'),
  ('hotel_owner', 'holidays.read'),
  ('hotel_owner', 'holidays.manage'),

  -- Team department assignment: same audience as team.manage.
  ('reception_manager', 'team.departments.assign'),
  ('reception_managers_manager', 'team.departments.assign'),
  ('hotel_general_manager', 'team.departments.assign'),
  ('hotel_owner', 'team.departments.assign');
