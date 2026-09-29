create extension if not exists pgcrypto;

create type public.member_role as enum ('OWNER', 'STAFF');
create type public.application_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.organization_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
create type public.subscription_status as enum ('PENDING_APPROVAL', 'TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

create table public.owner_applications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  owner_name text not null,
  business_name text not null,
  phone text not null,
  business_type text,
  gstin text,
  state text,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  status public.application_status not null default 'PENDING',
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status public.organization_status not null default 'PENDING',
  owner_user_id uuid not null references auth.users(id),
  gstin text,
  phone text,
  email text,
  address text,
  state text,
  preferred_language text not null default 'en' check (preferred_language in ('en','hi','hinglish')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  invoice_prefix text not null default 'BSP',
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  negative_stock_enabled boolean not null default false,
  default_print_format text not null default 'THERMAL_58MM' check (default_print_format in ('THERMAL_58MM','THERMAL_80MM','A4')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  application_id uuid references public.owner_applications(id) on delete set null,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  request_id text,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_price numeric(12,2),
  yearly_price numeric(12,2),
  currency text not null default 'INR',
  minimum_months integer not null default 1 check (minimum_months > 0),
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.plans(id),
  status public.subscription_status not null default 'PENDING_APPROVAL',
  starts_at timestamptz,
  ends_at timestamptz,
  grace_ends_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  admin_message text,
  provider text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.printer_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_tag text unique,
  serial_number text,
  printer_type text not null check (printer_type in ('THERMAL_58MM','THERMAL_80MM','A4')),
  ownership text not null default 'BRANDSPIRE' check (ownership in ('BRANDSPIRE','OWNER')),
  security_deposit numeric(12,2) not null default 0,
  deposit_status text not null default 'NOT_REQUIRED' check (deposit_status in ('NOT_REQUIRED','PENDING','PAID','PARTIAL_REFUND','REFUNDED','FORFEITED')),
  issued_at timestamptz,
  returned_at timestamptz,
  return_condition text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index owner_applications_status_created_idx on public.owner_applications(status, created_at desc);
create index organization_members_user_idx on public.organization_members(user_id, active);
create index organization_members_org_role_idx on public.organization_members(organization_id, role, active);
create index organizations_status_created_idx on public.organizations(status, created_at desc);
create index subscriptions_org_status_idx on public.subscriptions(organization_id, status);
create index subscriptions_ends_at_idx on public.subscriptions(status, ends_at);
create index printer_assets_org_active_idx on public.printer_assets(organization_id, active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger owner_applications_updated_at before update on public.owner_applications for each row execute function public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger organization_members_updated_at before update on public.organization_members for each row execute function public.set_updated_at();
create trigger organization_settings_updated_at before update on public.organization_settings for each row execute function public.set_updated_at();
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger printer_assets_updated_at before update on public.printer_assets for each row execute function public.set_updated_at();

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function public.has_org_role(target_org uuid, wanted_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role = wanted_role
      and m.active = true
  );
$$;

alter table public.owner_applications enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_settings enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.printer_assets enable row level security;

create policy owner_application_insert_own
on public.owner_applications for insert
to authenticated
with check (auth.uid() = auth_user_id and status = 'PENDING');

create policy owner_application_read_own
on public.owner_applications for select
to authenticated
using (auth.uid() = auth_user_id);

create policy organization_read_member
on public.organizations for select
to authenticated
using (public.is_org_member(id));

create policy organization_owner_update
on public.organizations for update
to authenticated
using (public.has_org_role(id, 'OWNER'))
with check (public.has_org_role(id, 'OWNER'));

create policy members_read_same_org
on public.organization_members for select
to authenticated
using (public.is_org_member(organization_id));

create policy settings_read_member
on public.organization_settings for select
to authenticated
using (public.is_org_member(organization_id));

create policy settings_owner_update
on public.organization_settings for update
to authenticated
using (public.has_org_role(organization_id, 'OWNER'))
with check (public.has_org_role(organization_id, 'OWNER'));

create policy terms_insert_own
on public.terms_acceptances for insert
to authenticated
with check (auth.uid() = user_id);

create policy terms_read_own
on public.terms_acceptances for select
to authenticated
using (auth.uid() = user_id);

create policy plans_read_active
on public.plans for select
to authenticated
using (active = true);

create policy subscriptions_read_member
on public.subscriptions for select
to authenticated
using (public.is_org_member(organization_id));

create policy printer_assets_owner_read
on public.printer_assets for select
to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

-- IMPORTANT:
-- Brandspire platform Admin actions are intentionally NOT exposed through ordinary client RLS policies.
-- They must go through the trusted API/service-role path with separate ADMIN authentication + audit logging.
