# Cashfree one-time subscription payments

Owner subscription checkout now uses Payment Gateway orders, not recurring mandates. AutoPay remains disabled. Prices come from active database plans; no Cashfree plan sync is needed.

## Deployment

1. Run the additive database migration `0004_cashfree_orders` before deploying the API.
2. Configure backend-only `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, and `CASHFREE_ENV=sandbox` with Cashfree **test** credentials initially. Never put these in Firebase frontend variables.
3. `API_PUBLIC_URL=https://brandspire-pos-api.onrender.com` and the first `WEB_URL` origin must be `https://bsp-pos.web.app`.
4. Configure the Cashfree payment webhook endpoint `https://brandspire-pos-api.onrender.com/api/payments/cashfree/webhook` (2025-01-01), including success, failed and user-dropped events. Signatures are checked against the raw body. Order creation also supplies this notify URL.
5. Register/whitelist `https://bsp-pos.web.app` with Cashfree as required for hosted checkout.
6. Test checkout with Cashfree sandbox payment instruments. Production deployments deliberately do not grant real entitlement from sandbox payments. The UI displays test success separately.
7. After sandbox acceptance, set production credentials and `CASHFREE_ENV=production`, configure the production webhook/domain, redeploy, and have the owner complete a live acceptance payment.

## Verification and recovery

Both signed webhooks and owner-scoped Check payment requests fetch the order and payments from Cashfree. Only PAID orders with a SUCCESS payment matching the stored amount/currency grant access. Redirect query parameters cannot activate a plan.

Activation, payment history, checkout completion and entitlement changes commit in one database transaction. Replays do not extend access twice. Failed webhook processing can retry. Recent checkout entries allow checking a payment after a closed tab or missing webhook. Pending or failed orders leave existing access unchanged.

Renewals preserve remaining active/trial/grace days and add 1, 6 or 12 calendar months, clamped for month-end/leap dates. A selected plan takes effect on successful payment. No automatic debit is scheduled. Refund/dispute automation and AutoPay are not part of this release.

Approved Basic pricing (13 November 2026): INR 399/month, INR 1799/6 months, INR 3499/year. Migration 0005 adds half_yearly_price and term_months. Purchased term_months is saved before checkout and governs access duration; the legacy MONTHLY/YEARLY column retains its interval unit for old readers. Existing sessions without term_months use their original cycle. Prices are configured in the live catalog, not overwritten by migrations.

## Local regression

Build the API, then run `node apps/api/scripts/cashfree-orders-smoke.mjs`. The suite uses an in-memory database and mocked Cashfree responses; it never charges or contacts a customer. Coverage includes ownership, pending/failed payments, mismatched amount/currency, rollback, retry, duplicate delivery, renewal dates, provider outage and production/sandbox isolation. A real hosted checkout acceptance test is still required.

References: https://www.cashfree.com/docs/payments/online/web/redirect and https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order
