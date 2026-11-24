# Universal billing implementation plan

Prepared 20 November 2026. Target: a cashier with limited reading or digital experience can save and recover a sale, even when optional services fail. This is a delivery plan, not a certification of current capabilities. Start with general retail; advertise additional business types only after their workflows pass acceptance.

## Product contract

- Manual cash checkout must not require AI or a printer. Initial account/device preparation and bounded offline authorization are explicit prerequisites.
- Distinguish draft, locally saved/pending sync, server confirmed, and payment pending. A network error is not evidence that a sale failed.
- Keep one durable operation identity across uncertain retries. Never silently replace an uncertain operation when the basket changes.
- Save the invoice before receipt delivery. A failed print is retried from the saved bill, never by repeating checkout. Do not automatically retry partially transmitted print jobs.
- Online access does not prove API availability. Offline and server-unavailable cases both need acceptance tests.
- Never infer customer payment success from a screenshot, selected UPI button or BSP subscription payment. Merchant collection and platform subscription are separate integrations.
- No promise of zero failures or recovery after app data is erased without backup. Publish device support, offline limits, recovery steps and known limitations.

## Current first increment

Web owner/staff billing gets an optional Simple Mode with larger controls, visible checkout steps, translated save buttons and optional spoken basket/amount review. All existing totals, permissions, customer/payment controls and recovery notices stay visible. Speech does not save bills. Device speech support and offline voice availability are not guaranteed.

This is an initial accessibility improvement, not the complete Simple Mode: product photo management, guided corrections, language coverage, first-use teaching and real-user observation remain outstanding. Native Android parity is pending.

## Delivery order and exit conditions

| Stage | Work | Required evidence |
| --- | --- | --- |
| 1 Correct records | Consolidate pending local changes; fixed-decimal money policy; refund allocation; durable mutation IDs; prevent changing unresolved requests | Lost-response retries create exactly one invoice/payment/refund; totals reconcile across ledger, stock and reports |
| 2 Durable offline core | Consistent local save/outbox flow; explicit recovery state; stale catalog and authorization policy; multi-terminal conflicts | Restart immediately before/after save; reconnect after 24/48 hours under documented policy; no silent discarded sale; overselling visible for manager resolution |
| 3 Recovery and security | Isolated staging; backup retention and restore; tenant/role matrix; storage capacity checks; credential review; dependency remediation | Restore into staging and reconcile counts/totals; cross-tenant access rejected; full/corrupt storage produces actionable warning |
| 4 Usable checkout | Simple/Standard views; localized speech/manual fallback; product photos; explicit review/correction; accessible controls; Android parity | 5–10 intended users sell, correct, save and reprint without coaching; document failures and revise |
| 5 Receipts and device delivery | Supported printer adapters; receipt job state; signed APK/update; offline receipt access; PDF/share alternatives | SC03h app print and reconnect; printer off/no paper; partial send warning; phone restart; app update preserves queued bills |
| 6 Payment and daily close | Merchant payment verification; split tender; delayed callbacks; cash shifts; supervisor overrides | Pending stays pending; duplicated callbacks do not duplicate collections; cash opening/closing and refunds reconcile |
| 7 Controlled pilot | Named retail shops/devices, monitoring, support and rollback | 3–5 shops over 7–14 days; daily reconciliation; no unresolved lost/duplicate sales or tenant leaks |
| 8 Business modules | Add modules individually using the common invoice/payment/outbox core | Each module passes its domain scenarios and the same failure matrix before being advertised |

## Module boundaries

Keep shared organization, catalog, pricing/tax, invoice, payment, credit note, inventory event, audit event and outbox contracts. Business presets enable actual capabilities, not only labels. Version migrations and sync payloads; preserve snapshots on finalized invoices.

- General retail: units, fractions, barcode, cash/credit, stock and returns.
- Services: non-stock items, jobs/appointments, advances and final settlement.
- Fashion: product variants, size/colour stock and exchanges.
- Wholesale: suppliers (schema alone is insufficient), purchasing, pack conversions, price tiers and credit limits.
- Restaurant: tables, open orders, kitchen tickets, modifiers and split bills.
- Pharmacy: batch stock, expiry, pack/unit conversion and batch-aware returns; domain review before release.
- Multi-branch: transfers, branch permissions, consolidated reports and device invoice-series design.
- Jurisdiction-specific tax/reporting adapters require separate current regulatory validation; generic GST fields do not establish compliance.

## Failure acceptance matrix

For each supported device: fresh setup, offline reopen, checkout disconnection, server timeout after commit, double tap, app kill, clock change, low/full storage, two offline terminals, expired authorization, printer disconnect, failed/late payment callback, failed restore and corrupt sync input. Record build SHA, test data, expected/actual records and recovery steps. Automated tests complement physical-device testing; neither substitutes for the other.

## Remaining deployment constraints

Local Save & Print commit 009eb09 was not pushed: Git authentication failed and the connected GitHub integration rejected writes. Financial fixes and SC03 integration also have local-only work. Coordinate API migrations and client releases; do not ship required-operation-ID backend changes alone to older clients. Next.js emitted a dependency security notice in the previous build: resolve it before public release. No live deployment or physical print is performed by this first increment.
