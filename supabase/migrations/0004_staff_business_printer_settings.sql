-- BRANDSPIRE POS PHASE 4
-- Staff lifecycle + richer business/invoice/printer settings.

alter table public.organizations
  add column if not exists city text,
  add column if not exists pincode text;

alter table public.organization_settings
  add column if not exists receipt_header text,
  add column if not exists receipt_footer text,
  add column if not exists invoice_footer text,
  add column if not exists default_payment_method text not null default 'CASH',
  add column if not exists allow_staff_discount boolean not null default false,
  add column if not exists staff_discount_limit numeric(5,2) not null default 0,
  add column if not exists show_gstin_on_receipt boolean not null default true,
  add column if not exists print_copies integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_settings_default_payment_method_check'
      and conrelid = 'public.organization_settings'::regclass
  ) then
    alter table public.organization_settings
      add constraint organization_settings_default_payment_method_check
      check (default_payment_method in ('CASH','UPI','CARD','CREDIT','OTHER'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_settings_staff_discount_limit_check'
      and conrelid = 'public.organization_settings'::regclass
  ) then
    alter table public.organization_settings
      add constraint organization_settings_staff_discount_limit_check
      check (staff_discount_limit >= 0 and staff_discount_limit <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_settings_print_copies_check'
      and conrelid = 'public.organization_settings'::regclass
  ) then
    alter table public.organization_settings
      add constraint organization_settings_print_copies_check
      check (print_copies between 1 and 5);
  end if;
end $$;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  created_by uuid references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_profiles_org_created_idx
  on public.staff_profiles(organization_id, created_at desc);

drop trigger if exists staff_profiles_updated_at on public.staff_profiles;
create trigger staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

alter table public.staff_profiles enable row level security;

-- Owners can read staff identity for their own tenant.
drop policy if exists staff_profiles_owner_read on public.staff_profiles;
create policy staff_profiles_owner_read
on public.staff_profiles for select
to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

-- Staff can read only their own profile.
drop policy if exists staff_profiles_self_read on public.staff_profiles;
create policy staff_profiles_self_read
on public.staff_profiles for select
to authenticated
using (auth.uid() = user_id and public.is_org_member(organization_id));

-- No client INSERT/UPDATE/DELETE policies by design.
-- Staff lifecycle changes are performed only by the trusted NestJS API after Owner authorization.

-- Owner audit visibility already exists from Phase 1. Add useful index for staff events.
create index if not exists audit_logs_org_action_created_idx
  on public.audit_logs(organization_id, action, created_at desc);

-- Server-side Staff discount boundary.
-- This trigger protects invoice creation even if someone bypasses the UI and calls the RPC directly.
create or replace function public.enforce_staff_invoice_discount_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
  v_limit numeric := 0;
begin
  if new.created_by_role = 'STAFF' and coalesce(new.discount_amount, 0) > 0 then
    select coalesce(s.allow_staff_discount, false), coalesce(s.staff_discount_limit, 0)
      into v_allowed, v_limit
    from public.organization_settings s
    where s.organization_id = new.organization_id;

    if not v_allowed then
      raise exception 'Staff discount is not enabled by the Owner';
    end if;

    if new.discount_type <> 'PERCENT' then
      raise exception 'Staff can only use percentage discounts';
    end if;

    if coalesce(new.discount_value, 0) > v_limit then
      raise exception 'Staff discount exceeds Owner limit of % percent', v_limit;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_staff_discount_policy on public.invoices;
create trigger invoices_staff_discount_policy
before insert or update of discount_type, discount_value, discount_amount on public.invoices
for each row execute function public.enforce_staff_invoice_discount_policy();
