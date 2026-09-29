-- Brandspire POS Phase 9
-- Razorpay recurring subscriptions, payment monitoring and webhook idempotency.
-- No secrets are stored in PostgreSQL. Provider secrets remain server-side environment variables.

alter type public.subscription_status add value if not exists 'PAST_DUE';
alter type public.subscription_status add value if not exists 'PAUSED';

alter table public.plans
  add column if not exists provider_monthly_plan_id text,
  add column if not exists provider_yearly_plan_id text;

alter table public.subscriptions
  add column if not exists provider_status text,
  add column if not exists provider_customer_id text,
  add column if not exists billing_cycle text check (billing_cycle is null or billing_cycle in ('MONTHLY','YEARLY')),
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists last_payment_at timestamptz,
  add column if not exists next_charge_at timestamptz;

create unique index if not exists subscriptions_provider_subscription_uidx
  on public.subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists public.subscription_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  created_by uuid not null references auth.users(id) on delete cascade,
  billing_cycle text not null check (billing_cycle in ('MONTHLY','YEARLY')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'INR',
  provider text not null default 'RAZORPAY',
  provider_subscription_id text not null unique,
  status text not null default 'CREATED' check (status in ('CREATED','VERIFIED','ACTIVATED','FAILED','CANCELLED')),
  payment_id text,
  signature_verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'RAZORPAY',
  provider_payment_id text,
  provider_order_id text,
  provider_subscription_id text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'INR',
  status text not null,
  method text,
  captured_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_transactions_provider_payment_uidx
  on public.payment_transactions(provider_payment_id)
  where provider_payment_id is not null;
create index if not exists payment_transactions_org_created_idx
  on public.payment_transactions(organization_id, created_at desc);
create index if not exists payment_transactions_provider_sub_idx
  on public.payment_transactions(provider_subscription_id);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  event_type text not null,
  provider text not null default 'RAZORPAY',
  provider_event_id text,
  provider_subscription_id text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists subscription_events_provider_event_uidx
  on public.subscription_events(provider_event_id)
  where provider_event_id is not null;
create index if not exists subscription_events_org_created_idx
  on public.subscription_events(organization_id, created_at desc);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'RAZORPAY',
  provider_event_id text not null unique,
  event_type text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  provider_subscription_id text,
  payload_hash text not null,
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSED','FAILED')),
  attempts integer not null default 1,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.subscription_checkout_sessions enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.payment_webhook_events enable row level security;

drop policy if exists subscription_checkout_owner_read on public.subscription_checkout_sessions;
create policy subscription_checkout_owner_read
on public.subscription_checkout_sessions for select to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

drop policy if exists payment_transactions_owner_read on public.payment_transactions;
create policy payment_transactions_owner_read
on public.payment_transactions for select to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

drop policy if exists subscription_events_owner_read on public.subscription_events;
create policy subscription_events_owner_read
on public.subscription_events for select to authenticated
using (public.has_org_role(organization_id, 'OWNER'));

-- No ordinary client policy is created for payment_webhook_events.
-- Platform Admin payment monitoring goes through the trusted service-role API.

-- Keep updated_at consistent with the rest of the project.
drop trigger if exists subscription_checkout_sessions_updated_at on public.subscription_checkout_sessions;
create trigger subscription_checkout_sessions_updated_at
before update on public.subscription_checkout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists payment_transactions_updated_at on public.payment_transactions;
create trigger payment_transactions_updated_at
before update on public.payment_transactions
for each row execute function public.set_updated_at();

-- Faster subscription lookup for access and monitoring.
create index if not exists subscriptions_org_created_idx
  on public.subscriptions(organization_id, created_at desc);
