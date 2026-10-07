# Cashfree Sandbox Integration

Brandspire POS now uses Cashfree for Owner subscription checkout.

## Backend environment

Set these only in the trusted API deployment/local API environment:

```env
CASHFREE_CLIENT_ID=
CASHFREE_CLIENT_SECRET=
CASHFREE_ENV=sandbox
CASHFREE_RETURN_URL=
```

`CASHFREE_RETURN_URL` is optional when `API_PUBLIC_URL` is configured. The backend will then use:

`{API_PUBLIC_URL}/api/payments/cashfree/return`

Never put `CASHFREE_CLIENT_SECRET` in Web, Android, `.env.example`, or GitHub.

## Flow

1. Admin opens Cashfree Billing.
2. Admin syncs the monthly/yearly Brandspire plan to Cashfree.
3. Owner selects a plan.
4. NestJS creates the Cashfree subscription server-side.
5. Cashfree returns a subscription session ID.
6. Web opens Cashfree Subscription Checkout in Sandbox.
7. Cashfree redirects to the API return endpoint.
8. The API fetches the subscription status from Cashfree.
9. The API updates the Brandspire subscription.
10. Cashfree webhooks are signature-verified and processed idempotently.

Cashfree webhook verification uses the exact raw request body plus `x-webhook-timestamp` and `x-webhook-signature`.

## Supabase

Apply the new migration:

`supabase/migrations/0011_cashfree_subscriptions.sql`

Existing Razorpay migration history is retained for database migration compatibility. Existing Razorpay records are not silently rewritten; new application payment records use `CASHFREE`.

## Staging

Use Cashfree Sandbox credentials with:

```env
APP_ENV=staging
CASHFREE_ENV=sandbox
API_PUBLIC_URL=https://YOUR-NORTHFLANK-API
CASHFREE_RETURN_URL=https://YOUR-NORTHFLANK-API/api/payments/cashfree/return
```

The web checkout SDK runs in Cashfree Sandbox mode.

## Before production

Do not switch `CASHFREE_ENV=production` until Cashfree production credentials, domain configuration, webhook configuration, and end-to-end sandbox testing are complete.
