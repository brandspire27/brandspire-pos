# Financial fixes — 15 November 2026

Implemented locally; not deployed. The public-release hold still applies.

## Changed behavior

- Collection, refund, stock adjustment and cancellation now require a UUID `operationId`. The result and request hash are committed in the same database transaction as the mutation. Same-ID replay returns the original result; a changed user/action/target/payload is rejected. Failed transactions leave no operation record.
- Web and Android payment/stock clients persist pending IDs before sending. Web refund/cancellation uses the same mechanism. IDs survive lost responses and reload/restart storage. An unconfirmed action with changed details is blocked until the original details are retried. A later authorization failure cannot discard an earlier unknown outcome.
- Clients prevent overlapping submissions. Web requires Web Locks support; unsupported browsers fail safely. Device storage failure blocks transmission. Clearing browser/app data can still destroy pending local retry information; reconcile records before manually recreating an uncertain action.
- Refund amounts are negative in payment breakdowns and web invoice payment history. Sales and tax reporting use invoice-date sale events and credit-note-date negative events. Full refunds no longer erase the original sale from its original period. Partial credits affect product quantities, tax rates, daily totals and staff activity.
- Staff activity attributes each event to the actor who performed it (refunds to the refund issuer). Bill counts count original invoices; credits do not create negative bill counts. `averageBill` is period net sales / original invoice count, or zero when no invoices exist. Dues remain the current unpaid balance for invoices issued in the selected interval; collections are actual net cash events in that interval, so they need not equal sales.
- Customer ledger retains the invoice, collection, credit note and refund movements. Credit notes reduce debt; refund outflows increase the ledger debit to offset the returned cash. Net balance reconciles after tested partial/full refunds.

## Verification

- API build and isolated API smoke suites.
- Added backend tests for same-ID replay, changed-payload rejection, rollback, concurrent collection/stock/cancellation/refund, missing-ID rejection and foreign-shop isolation.
- Added financial tests: January sale / February refund separation, partial and full returns, GST rate totals, net collection and customer ledger reconciliation.
- Added client storage tests: response lost after simulated commit, persistent same-ID retry, changed-detail block, later session failure, new acknowledged action and storage-full failure.
- Firebase production static build; Android full debug build and receipt unit tests.

These tests do not certify a physical phone/printer, actual Android persistence across an OS restart, live Turso multi-process contention, accounting compliance or a production payment settlement. Refund rounding/allocation for arbitrary sub-paisa line totals and broad financial edge cases still require additional acceptance coverage before claiming complete financial readiness.

## Deployment sequence

1. Take and verify a restorable database backup.
2. The API container runs the idempotent migration runner before starting. Confirm migrations **0007_pos_operations** and **0008_financial_events** are applied in the target database; they add a table and reporting views. Do not edit old migration checksums.
3. Coordinate API, Firebase web and signed Android updates in a maintenance window. Older clients without operation IDs will receive a clear 400 response for these mutations; do not deploy this backend alone and expect old clients to remain compatible.
4. Verify authenticated staging flows including a lost response and reload. Check actual report totals and ledger with the deployed revision.
5. Complete remaining release gates: production backup restore, credential revocation evidence, signed APK/install/update, phone/printer matrix, tenant HTTP acceptance, live payment/settlement and pilot.

Do not remove operation records during routine cleanup: deleting them removes replay protection. API/Web/Android rollback must be coordinated; retain database additions and review any mutations since rollout.
