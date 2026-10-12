-- New permission for Milestone 12's onboarding/activation flow. Deliberately
-- separate from the existing hotel.settings.manage (rather than reusing it),
-- following the M3 precedent of ai_agents.update vs ai_agents.activate being
-- separately grantable even though the baseline seed grants them to the same
-- roles today — this lets a future change (e.g. restricting activation to
-- Owner-only while GM keeps settings-edit) happen without re-touching the
-- settings permission. Granted at the same GM/Owner tier as
-- hotel.settings.manage for now. See docs/rbac.md Milestone 12 section.

insert into public.permissions (key, module, description, platform_moderator_can_read) values
  ('hotel.activate', 'onboarding', 'Activate a hotel once its readiness checklist passes', true);

insert into public.role_permissions (role_key, permission_key) values
  ('hotel_general_manager', 'hotel.activate'),
  ('hotel_owner', 'hotel.activate');
