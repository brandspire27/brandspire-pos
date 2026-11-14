# Payment audit — 14 November 2026

Scope: one-time Cashfree plan purchases. No real payment or live database mutation was performed during this audit. Provider responses are simulated; database tests use a migrated in-memory SQLite database. This is not certification of bank settlement or the entire POS.

## Verified

- Backend uses stored plan prices, not a client-supplied amount: INR 399 / 1799 / 3499 and 1 / 6 / 12 calendar months.
- Verification checks owner and organization, provider environment, order ID, order amount/currency and a successful payment from Cashfree's server API.
- Signed raw-body webhook requests return HTTP 200; altered/invalid signatures are rejected. Processing errors remain retryable.
- Unpaid, failed and mismatched payments do not activate access.
- Transaction failure rolls back activation; replay recovers without a second purchase.
- Repeated notifications, differently formatted duplicate events, late failed events and concurrent verification/webhook requests create only one transaction for an order. Contending database writers can require retry.
- Existing remaining access is preserved; month-end/leap dates clamp correctly.
- Sandbox payments cannot activate production access.
- Unknown orders and legacy mandate events cannot grant access.

## Fixed in this audit

A success webhook previously returned success when the order API still reported a pending order. It now returns a retryable error until the order/payment can be verified (sandbox test-only confirmation remains acknowledged). Added regression coverage for eventual consistency, malformed payloads, late/duplicate events, concurrency and environment mismatch.

## Remaining limits and follow-up priorities

1. There is no scheduled reconciliation worker. Recovery currently depends on webhook retries or the owner's existing Check payment action. Add durable periodic reconciliation for known unresolved orders, especially when browser return and webhook delivery both fail.
2. Each checkout request generates a new order. UI disables buttons while working, but cross-tab retries or a lost checkout response can still create multiple unpaid orders. Add client request idempotency/resume before broad rollout. Never ask a charged customer to pay again solely because activation failed.
3. Pending checkout recovery lists only five orders. Older unresolved orders need paginated history/admin recovery and alerting.
4. Refunds, disputes and chargebacks have no complete entitlement/reconciliation workflow in this one-time integration. Define the access/refund policy and implement it before treating these as automated.
5. Render cold starts and external network/provider outages are not eliminated by local tests. Delivery timing and provider retry policy must be monitored in production.
6. Cashfree sandbox end-to-end browser checkout, actual live settlement and refund behaviour are not validated by mocked tests. The user confirmed the dashboard webhook probe succeeded; this alone does not prove paid subscription activation or settlement.

## Commands passed

```text
node apps/api/node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
node apps/api/scripts/cashfree-orders-smoke.mjs
node apps/api/scripts/cashfree-webhook-http-smoke.mjs
```

Reference: https://www.cashfree.com/docs/payments/online/webhooks/troubleshooting
