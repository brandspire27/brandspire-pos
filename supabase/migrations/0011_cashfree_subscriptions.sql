-- Brandspire POS Cashfree subscription provider migration.
-- Existing Razorpay records are preserved as historical data.
-- New subscription/payment records created by the application use CASHFREE.

alter table public.subscription_checkout_sessions
  alter column provider set default 'CASHFREE';

alter table public.payment_transactions
  alter column provider set default 'CASHFREE';

alter table public.subscription_events
  alter column provider set default 'CASHFREE';

alter table public.payment_webhook_events
  alter column provider set default 'CASHFREE';

create index if not exists subscription_checkout_sessions_provider_idx
  on public.subscription_checkout_sessions(provider, provider_subscription_id);

create index if not exists subscriptions_provider_idx
  on public.subscriptions(provider, provider_subscription_id);
