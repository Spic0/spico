-- Consolidated authorization functions and RLS policies for the tables
-- created in the preceding migrations. Split out into its own migration
-- because it references columns/tables across the whole foundation schema.
-- See docs/rbac.md for the permission matrix this encodes.

-- Resolves organization scope from either an explicit organization_id or a
-- hotel_id (looking up the hotel's own organization), then checks whether
-- the user has the given permission via platform role or membership grant.
create or replace function public.has_permission(
  p_user_id uuid,
  p_permission text,
  p_hotel_id uuid default null,
  p_organization_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org_id uuid;
begin
  if p_hotel_id is not null then
    select organization_id into v_org_id from public.hotels where id = p_hotel_id;
  else
    v_org_id := p_organization_id;
  end if;

  if exists (
    select 1 from public.profiles
    where id = p_user_id and platform_role in ('admin', 'superadmin')
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.profiles pr
    join public.permissions perm on perm.key = p_permission
    where pr.id = p_user_id
      and pr.platform_role = 'moderator'
      and perm.platform_moderator_can_read
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_key = m.role_key
    where m.profile_id = p_user_id
      and m.status = 'active'
      and rp.permission_key = p_permission
      and (
        (p_hotel_id is not null and m.hotel_id = p_hotel_id)
        or (m.hotel_id is null and m.organization_id = v_org_id)
      )
  );
end;
$$;

-- Team-management specific check: requires team.manage AND that the caller's
-- highest applicable role rank in that scope is strictly above the target
-- role's rank (so e.g. a Reception Manager cannot promote anyone to Hotel
-- Owner, or edit another Reception Manager's membership). Platform
-- admins/superadmins are not rank-limited.
create or replace function public.can_manage_membership(
  p_user_id uuid,
  p_target_role_key text,
  p_hotel_id uuid,
  p_organization_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_caller_max_rank integer;
  v_target_rank integer;
begin
  if not public.has_permission(p_user_id, 'team.manage', p_hotel_id, p_organization_id) then
    return false;
  end if;

  if exists (
    select 1 from public.profiles
    where id = p_user_id and platform_role in ('admin', 'superadmin')
  ) then
    return true;
  end if;

  select max(r.rank) into v_caller_max_rank
  from public.memberships m
  join public.roles r on r.key = m.role_key
  where m.profile_id = p_user_id
    and m.status = 'active'
    and (
      (p_hotel_id is not null and m.hotel_id = p_hotel_id)
      or (m.hotel_id is null and m.organization_id = p_organization_id)
    );

  select rank into v_target_rank from public.roles where key = p_target_role_key;

  return coalesce(v_caller_max_rank, 0) > coalesce(v_target_rank, 999);
end;
$$;

-- organizations -------------------------------------------------------------

create policy "organizations_select_member_or_platform"
  on public.organizations for select
  using (
    public.is_platform_user(auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.organization_id = organizations.id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "organizations_insert_authenticated"
  on public.organizations for insert
  to authenticated
  with check (true);

create policy "organizations_update_permission"
  on public.organizations for update
  using (public.has_permission(auth.uid(), 'hotel.settings.manage', null, id))
  with check (public.has_permission(auth.uid(), 'hotel.settings.manage', null, id));

-- hotels ----------------------------------------------------------------------

create policy "hotels_select_member_or_platform"
  on public.hotels for select
  using (
    public.is_platform_user(auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.profile_id = auth.uid()
        and m.status = 'active'
        and (m.hotel_id = hotels.id or (m.hotel_id is null and m.organization_id = hotels.organization_id))
    )
  );

create policy "hotels_insert_permission"
  on public.hotels for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'hotel.settings.manage', null, organization_id));

create policy "hotels_update_permission"
  on public.hotels for update
  using (public.has_permission(auth.uid(), 'hotel.settings.manage', id, organization_id))
  with check (public.has_permission(auth.uid(), 'hotel.settings.manage', id, organization_id));

-- memberships -------------------------------------------------------------------

create policy "memberships_select_self_or_permission"
  on public.memberships for select
  using (
    profile_id = auth.uid()
    or public.has_permission(auth.uid(), 'team.view', hotel_id, organization_id)
  );

create policy "memberships_insert"
  on public.memberships for insert
  to authenticated
  with check (
    public.can_manage_membership(auth.uid(), role_key, hotel_id, organization_id)
    or (
      -- Bootstrap: the creator of a brand-new organization becomes its first Hotel Owner.
      profile_id = auth.uid()
      and role_key = 'hotel_owner'
      and hotel_id is null
      and not exists (
        select 1 from public.memberships existing
        where existing.organization_id = memberships.organization_id
      )
    )
  );

create policy "memberships_update"
  on public.memberships for update
  using (public.can_manage_membership(auth.uid(), role_key, hotel_id, organization_id))
  with check (public.can_manage_membership(auth.uid(), role_key, hotel_id, organization_id));

create policy "memberships_delete"
  on public.memberships for delete
  using (public.can_manage_membership(auth.uid(), role_key, hotel_id, organization_id));

-- invitations -------------------------------------------------------------------

create policy "invitations_select_permission"
  on public.invitations for select
  using (public.has_permission(auth.uid(), 'team.view', hotel_id, organization_id));

create policy "invitations_insert_permission"
  on public.invitations for insert
  to authenticated
  with check (public.can_manage_membership(auth.uid(), role_key, hotel_id, organization_id));

create policy "invitations_update_permission"
  on public.invitations for update
  using (public.has_permission(auth.uid(), 'team.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'team.manage', hotel_id, organization_id));

-- audit_log -----------------------------------------------------------------------
-- Insert or select only. Never update/delete (append-only).

create policy "audit_log_select_permission"
  on public.audit_log for select
  using (public.has_permission(auth.uid(), 'audit_log.view', hotel_id, organization_id));

create policy "audit_log_insert_scoped_member"
  on public.audit_log for insert
  to authenticated
  with check (
    actor_profile_id = auth.uid()
    and (
      public.is_platform_user(auth.uid())
      or exists (
        select 1 from public.memberships m
        where m.profile_id = auth.uid()
          and m.status = 'active'
          and (
            (hotel_id is not null and m.hotel_id = hotel_id)
            or (m.hotel_id is null and m.organization_id = organization_id)
          )
      )
    )
  );
