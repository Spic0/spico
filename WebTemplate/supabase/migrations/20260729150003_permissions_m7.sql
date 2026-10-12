-- New permission for Milestone 7. One permission gates the internal booking
-- configuration screen (enable/disable public booking, stay limits, terms). The
-- public guest flow needs no permission at all — it goes through anon-executable
-- SECURITY DEFINER RPCs. booking.manage is hotel-wide configuration, so it sits
-- with the GM/Owner tier plus Reception Managers Manager (same bar as pms.manage).

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('booking.manage', 'booking', 'Configure the public booking engine (enable, stay limits, terms)', true);

insert into public.role_permissions (role_key, permission_key) values
  ('reception_managers_manager', 'booking.manage'),
  ('hotel_general_manager', 'booking.manage'),
  ('hotel_owner', 'booking.manage');
