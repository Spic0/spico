-- Milestone 12: closes a genuine pre-existing gap. invitations' own table
-- comment (20260723090007) always said "Accepted via a server action that
-- creates the membership row" — that action was never built in M1-M11.
-- invitations_insert_permission (can_manage_membership) lets a manager
-- CREATE an invitation, but memberships_insert's RLS has no path for an
-- invited user (not yet a member of the org) to insert their own membership
-- row — only can_manage_membership() (requires already being a manager) or
-- the one-time first-owner bootstrap admit an insert. Closing this requires
-- a SECURITY DEFINER function, exactly like the M11 folio functions.
--
-- Two functions: a read-only preview (so the /invite/[token] page can show
-- "join {org} as {role}" before the user commits) and the accept action
-- itself. Neither loosens organizations'/invitations' existing RLS — both
-- read/write exactly what they need as the function owner.

create or replace function public.get_invitation_preview(p_token uuid)
returns table (
  email text,
  role_key text,
  role_label text,
  organization_name text,
  hotel_name text,
  status text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.email,
    i.role_key,
    r.label,
    o.name,
    h.name,
    i.status,
    i.expires_at
  from public.invitations i
  join public.roles r on r.key = i.role_key
  join public.organizations o on o.id = i.organization_id
  left join public.hotels h on h.id = i.hotel_id
  where i.token = p_token;
$$;

create or replace function public.accept_invitation(p_token uuid)
returns table (organization_id uuid, organization_slug text, hotel_id uuid, role_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_caller_email text;
  v_active_member_count integer;
  v_max_users smallint;
begin
  select email into v_caller_email from public.profiles where id = auth.uid();
  if v_caller_email is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invitation from public.invitations where token = p_token;
  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;
  if v_invitation.status != 'pending' then
    raise exception 'This invitation is no longer pending (status: %)', v_invitation.status;
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'This invitation has expired';
  end if;
  if lower(v_invitation.email) != lower(v_caller_email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  -- Plan-limit re-check at accept time — mirrors lib/planLimits.ts's
  -- checkMembershipCreationAllowed(), which already ran once at invite time,
  -- but time may have passed and the org's plan/usage could have changed.
  -- A missing subscription row is treated as an anomaly and fails closed,
  -- same stance as the app-level service (every org is auto-seeded one on
  -- creation, so a missing row is never a normal state to silently allow).
  select p.max_users into v_max_users
  from public.organization_subscriptions os
  join public.plans p on p.id = os.plan_id
  where os.organization_id = v_invitation.organization_id;

  if not found then
    raise exception 'This organization has no active subscription — contact support before accepting invitations.';
  end if;

  if v_max_users is not null then
    select count(*) into v_active_member_count
    from public.memberships
    where organization_id = v_invitation.organization_id and status = 'active';

    if v_active_member_count >= v_max_users then
      raise exception 'This organization has reached its plan''s team member limit (%). Ask the organization owner to upgrade before accepting.', v_max_users;
    end if;
  end if;

  insert into public.memberships (profile_id, organization_id, hotel_id, role_key, status)
  values (auth.uid(), v_invitation.organization_id, v_invitation.hotel_id, v_invitation.role_key, 'active');

  update public.invitations set status = 'accepted' where id = v_invitation.id;

  return query
    select o.id, o.slug, v_invitation.hotel_id, v_invitation.role_key
    from public.organizations o
    where o.id = v_invitation.organization_id;
end;
$$;

revoke execute on function public.get_invitation_preview(uuid) from public;
revoke execute on function public.get_invitation_preview(uuid) from anon;
revoke execute on function public.get_invitation_preview(uuid) from authenticated;
grant execute on function public.get_invitation_preview(uuid) to authenticated;

revoke execute on function public.accept_invitation(uuid) from public;
revoke execute on function public.accept_invitation(uuid) from anon;
revoke execute on function public.accept_invitation(uuid) from authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
