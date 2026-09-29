-- Brandspire POS Phase 7
-- Fast, tenant-safe workspace bootstrap for Owner/Staff UI.
-- This reduces the startup path to one authenticated RPC instead of several sequential reads.

create or replace function public.get_current_workspace()
returns table (
  organization_id uuid,
  organization_name text,
  role text,
  preferred_language text,
  subscription_status text,
  ends_at timestamptz,
  admin_message text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    om.organization_id,
    o.name as organization_name,
    om.role::text,
    coalesce(o.preferred_language, 'en')::text as preferred_language,
    coalesce(s.status::text, 'PENDING_APPROVAL') as subscription_status,
    s.ends_at,
    s.admin_message
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  left join lateral (
    select sub.status, sub.ends_at, sub.admin_message
    from public.subscriptions sub
    where sub.organization_id = om.organization_id
    order by sub.created_at desc
    limit 1
  ) s on true
  where om.user_id = auth.uid()
    and om.active = true
  limit 1;
$$;

revoke all on function public.get_current_workspace() from public;
grant execute on function public.get_current_workspace() to authenticated;
