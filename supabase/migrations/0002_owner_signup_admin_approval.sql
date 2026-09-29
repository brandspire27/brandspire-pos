-- BRANDSPIRE POS PHASE 1.1
-- Owner signup trigger + platform admin registry + atomic application approval.

alter table public.owner_applications
  add column if not exists address text,
  add column if not exists preferred_language text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'owner_applications_preferred_language_check'
      and conrelid = 'public.owner_applications'::regclass
  ) then
    alter table public.owner_applications
      add constraint owner_applications_preferred_language_check
      check (preferred_language in ('en', 'hi', 'hinglish'));
  end if;
end $$;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_created_idx
  on public.audit_logs(organization_id, created_at desc);
create index if not exists audit_logs_actor_created_idx
  on public.audit_logs(actor_user_id, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.audit_logs enable row level security;

-- No client RLS policies are intentionally created for platform_admins.
-- Platform Admin verification goes only through the trusted API/service-role path.

create policy audit_logs_owner_read
on public.audit_logs for select
to authenticated
using (
  organization_id is not null
  and public.has_org_role(organization_id, 'OWNER')
);

drop trigger if exists platform_admins_updated_at on public.platform_admins;
create trigger platform_admins_updated_at
before update on public.platform_admins
for each row execute function public.set_updated_at();

insert into public.plans (code, name, monthly_price, yearly_price, currency, minimum_months, features, active)
values (
  'BASIC',
  'Brandspire POS Basic',
  399.00,
  3990.00,
  'INR',
  1,
  '{"THERMAL_PRINTING":true,"A4_INVOICES":true,"STAFF_ACCESS":true}'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  currency = excluded.currency,
  minimum_months = excluded.minimum_months,
  features = excluded.features,
  active = excluded.active;

create or replace function public.handle_owner_application_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  application_id uuid;
  accepted boolean := false;
begin
  if coalesce(metadata->>'account_type', '') <> 'OWNER_APPLICATION' then
    return new;
  end if;

  begin
    accepted := coalesce((metadata->>'terms_accepted')::boolean, false);
  exception when others then
    accepted := false;
  end;

  if not accepted then
    raise exception 'Brandspire POS Terms & Conditions must be accepted';
  end if;

  insert into public.owner_applications (
    auth_user_id,
    email,
    owner_name,
    business_name,
    phone,
    business_type,
    gstin,
    state,
    address,
    preferred_language,
    terms_version,
    terms_accepted_at,
    status
  ) values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(metadata->>'owner_name'), ''),
    nullif(trim(metadata->>'business_name'), ''),
    nullif(trim(metadata->>'phone'), ''),
    nullif(trim(metadata->>'business_type'), ''),
    nullif(upper(trim(metadata->>'gstin')), ''),
    nullif(trim(metadata->>'state'), ''),
    nullif(trim(metadata->>'address'), ''),
    case when metadata->>'preferred_language' in ('en','hi','hinglish') then metadata->>'preferred_language' else 'en' end,
    coalesce(nullif(metadata->>'terms_version', ''), 'UNKNOWN'),
    now(),
    'PENDING'
  )
  returning id into application_id;

  insert into public.terms_acceptances (
    user_id,
    application_id,
    terms_version,
    accepted_at
  ) values (
    new.id,
    application_id,
    coalesce(nullif(metadata->>'terms_version', ''), 'UNKNOWN'),
    now()
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_owner_application on auth.users;
create trigger on_auth_user_created_owner_application
after insert on auth.users
for each row execute function public.handle_owner_application_signup();

create or replace function public.approve_owner_application(
  p_application_id uuid,
  p_admin_user_id uuid,
  p_access_mode text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_plan_id uuid default null,
  p_admin_message text default '',
  p_printer_type text default null,
  p_security_deposit numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.owner_applications%rowtype;
  v_organization_id uuid;
  organization_slug text;
  subscription_state public.subscription_status;
begin
  if not exists (
    select 1 from public.platform_admins
    where user_id = p_admin_user_id and active = true
  ) then
    raise exception 'Brandspire Admin access required';
  end if;

  if p_access_mode not in ('TRIAL', 'SUBSCRIPTION') then
    raise exception 'Invalid access mode';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'Expiry date must be after start date';
  end if;

  select * into app
  from public.owner_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Owner application not found';
  end if;

  if app.status <> 'PENDING' then
    raise exception 'Owner application has already been reviewed';
  end if;

  organization_slug := trim(both '-' from regexp_replace(lower(app.business_name), '[^a-z0-9]+', '-', 'g'))
    || '-' || left(replace(app.id::text, '-', ''), 8);

  insert into public.organizations (
    name,
    slug,
    status,
    owner_user_id,
    gstin,
    phone,
    email,
    address,
    state,
    preferred_language
  ) values (
    app.business_name,
    organization_slug,
    'ACTIVE',
    app.auth_user_id,
    app.gstin,
    app.phone,
    app.email,
    app.address,
    app.state,
    app.preferred_language
  ) returning id into v_organization_id;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (v_organization_id, app.auth_user_id, 'OWNER', true);

  insert into public.organization_settings (organization_id)
  values (v_organization_id);

  subscription_state := case
    when p_access_mode = 'TRIAL' then 'TRIAL'::public.subscription_status
    else 'ACTIVE'::public.subscription_status
  end;

  insert into public.subscriptions (
    organization_id,
    plan_id,
    status,
    starts_at,
    ends_at,
    approved_by,
    approved_at,
    admin_message
  ) values (
    v_organization_id,
    p_plan_id,
    subscription_state,
    p_starts_at,
    p_ends_at,
    p_admin_user_id,
    now(),
    nullif(trim(p_admin_message), '')
  );

  if p_printer_type is not null then
    if p_printer_type not in ('THERMAL_58MM', 'THERMAL_80MM', 'A4') then
      raise exception 'Invalid printer type';
    end if;

    insert into public.printer_assets (
      organization_id,
      printer_type,
      ownership,
      security_deposit,
      deposit_status,
      issued_at,
      active
    ) values (
      v_organization_id,
      p_printer_type,
      'BRANDSPIRE',
      greatest(coalesce(p_security_deposit, 0), 0),
      case when coalesce(p_security_deposit, 0) > 0 then 'PENDING' else 'NOT_REQUIRED' end,
      now(),
      true
    );
  end if;

  update public.terms_acceptances ta
  set organization_id = v_organization_id
  where ta.application_id = app.id
    and ta.user_id = app.auth_user_id;

  update public.owner_applications
  set status = 'APPROVED',
      admin_note = nullif(trim(p_admin_message), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = app.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary
  ) values (
    v_organization_id,
    p_admin_user_id,
    'ADMIN',
    'OWNER_APPLICATION_APPROVED',
    'OWNER_APPLICATION',
    app.id,
    jsonb_build_object(
      'access_mode', p_access_mode,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'printer_type', p_printer_type,
      'security_deposit', coalesce(p_security_deposit, 0)
    )
  );

  return v_organization_id;
end;
$$;

create or replace function public.reject_owner_application(
  p_application_id uuid,
  p_admin_user_id uuid,
  p_admin_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.owner_applications%rowtype;
begin
  if not exists (
    select 1 from public.platform_admins
    where user_id = p_admin_user_id and active = true
  ) then
    raise exception 'Brandspire Admin access required';
  end if;

  select * into app
  from public.owner_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Owner application not found';
  end if;

  if app.status <> 'PENDING' then
    raise exception 'Owner application has already been reviewed';
  end if;

  update public.owner_applications
  set status = 'REJECTED',
      admin_note = nullif(trim(p_admin_note), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = app.id;

  insert into public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary
  ) values (
    p_admin_user_id,
    'ADMIN',
    'OWNER_APPLICATION_REJECTED',
    'OWNER_APPLICATION',
    app.id,
    jsonb_build_object('note', coalesce(p_admin_note, ''))
  );
end;
$$;
