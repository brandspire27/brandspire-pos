# Brandspire POS — Phase 9
## Razorpay Subscriptions + SaaS Access Billing

Phase 9 introduces the real SaaS payment layer:

- Owner Subscription page
- Monthly and yearly database-driven plans
- Razorpay recurring Subscription creation
- Standard Checkout authorisation
- Server-side checkout signature verification
- Raw-body webhook signature verification
- `x-razorpay-event-id` idempotency
- Payment transaction history
- Subscription lifecycle events
- Admin Razorpay plan sync + payment/webhook monitoring
- Cancel automatic renewal at cycle end
- No Razorpay secrets in the browser

## 1. Copy the patch
Copy all files from this update into your existing `brandspire-pos-starter` folder and replace matching files.

## 2. Run the migration
Supabase → SQL Editor → run:

`supabase/migrations/0009_razorpay_subscriptions.sql`

## 3. Configure Razorpay TEST keys first
In `apps/api/.env` add:

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=choose_a_separate_webhook_secret
```

Do not put the Key Secret or Webhook Secret in `apps/web/.env.local`.

## 4. Restart

```powershell
npx pnpm@11.24.0 dev
```

No new npm package is required.

## 5. Admin: sync database plans
Login as Brandspire Admin → open `/admin/billing`.

For each active plan, click:
- Sync monthly
- Sync yearly

Razorpay plans are immutable provider objects; Brandspire stores their provider IDs against the database plan. If Brandspire pricing changes later, create/sync a new provider plan rather than silently changing the existing Razorpay Plan.

## 6. Razorpay webhook
Configure the webhook in Razorpay Test Mode to point to a public HTTPS staging API URL:

`https://YOUR-STAGING-API/api/payments/razorpay/webhook`

Use the exact same value as `RAZORPAY_WEBHOOK_SECRET` when configuring the webhook secret.

Recommended events for this phase:
- `subscription.activated`
- `subscription.charged`
- `subscription.halted`
- `subscription.cancelled`
- `subscription.completed`
- `payment.captured`
- `payment.failed`

Localhost cannot receive an ordinary external webhook directly; use your deployed staging backend for end-to-end webhook testing.

## 7. Owner test
Owner → Subscription.

1. Confirm the current trial/manual subscription is shown.
2. Choose Monthly or Yearly.
3. Complete a Razorpay Test Mode checkout.
4. Checkout result is verified server-side.
5. Webhook updates the provider lifecycle/payment records.
6. Payment history appears on the Subscription screen.

## 8. Important safety properties
- Frontend payment success alone never activates access without server verification/provider status.
- Webhook HMAC uses the raw request body.
- Duplicate webhook event IDs are ignored using a database unique constraint.
- Razorpay secrets are server-only.
- Owner can only manage their own organization subscription.
- Staff has no subscription/payment-management endpoint.

## Not yet claimed complete
This phase creates the real provider integration, but production go-live still requires:
- Razorpay account/KYC/product approval as applicable
- staging webhook tests
- failure/retry tests
- duplicate webhook test
- subscription pause/resume/upgrade rules
- production HTTPS domain
- background queue processing for webhook side-effects at scale
- final legal/commercial review of subscription/refund wording
