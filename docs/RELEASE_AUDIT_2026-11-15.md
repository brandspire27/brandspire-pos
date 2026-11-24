# BrandSpire POS release audit — 15 November 2026

## Decision

Later implementation update: see FINANCIAL_FIXES_2026-11-15.md. Refund event reporting and persistent operation IDs are now implemented and tested locally. Their production/staging acceptance and the remaining gates below are still outstanding; the findings table records the audit baseline.

**HOLD public release.** The live web application and API respond, and important automated checks pass. This does not establish that every shop, phone or printer is supported. Close the financial correctness, recovery, distribution and device acceptance gates below before a controlled pilot. Public launch follows pilot acceptance, not merely a successful build.

This report supersedes the testing status in the 14 November Word report. It is a bounded source review plus automated/local and unauthenticated production checks, not an independent penetration test, legal review or physical-device certification. Changes made during this audit are local; no production deployment or real payment was performed.

## Fresh evidence

| Area | Result and limits |
| --- | --- |
| API build | Nest build passed after the transaction changes. |
| Web production export | Firebase static export passed, including TypeScript and 34 pages. Initial sandbox EPERM was resolved by rerunning with filesystem access. |
| Android | Debug APK assembled; three receipt quantity/raster packing tests passed in the immediately preceding verification. Hindi bitmap appearance and real transport are not covered by those tests. |
| API smoke checks | AI configuration, insights, POS drafts, billing, entitlement, Cashfree orders, raw-body webhook, migrations, local restore and mutation concurrency checks pass. Tests use isolated databases/provider stubs, not real charges. |
| Web smoke checks | Offline IndexedDB, workspace scope/expiry, service-worker fallback and voice bill-review checks pass. These simulate storage/worker behavior, not an OS restart. |
| Production health | `/api/health` and `/api/health/ready` returned 200; readiness reported database OK. |
| Production policy | Environment production; Cashfree configured and production. Advertised API version `0.22.0-dev`, release SHA null; Android update URL null. These are visibility/distribution gaps. |
| Production access control | Anonymous requests to POS products, owner workspace and admin identity returned 401. Authenticated cross-tenant HTTP matrix is still outstanding. |
| Public website | Landing, status and terms returned 200 with X-Frame-Options DENY. `/privacy` returned 404; a separate privacy notice and actual support/refund contacts need review. This is a product/documentation finding, not a legal conclusion. |
| Local production preflight | Four failures: missing Android Firebase API key, non-HTTPS Android API URL, local Android API address, local API APP_ENV not production. Local Cashfree sandbox warning. These local values do not contradict the observed production Render policy. |

Evidence logs are under `.tmp/audit-*.log`; Android build evidence is `.tmp/android-verification.log` and its JUnit XML. Logs are local diagnostics, not release artifacts.

## Problems corrected during this audit

1. Migration smoke test expected only three migrations. It now verifies all current migrations apply once, skip on repetition, preserve tenant foreign keys and include payment recovery columns.
2. Manual dues collection, cancellation and inventory adjustment read mutable balances before opening their write transaction. Those reads now occur inside the transaction, preventing stale values from being reused by serialized writers.
3. Refund eligibility/credited balance is now checked inside the transaction. The backend now enforces fully paid invoices for the existing paid-invoice refund workflow, matching its UI selection rule.
4. Sub-paisa collections that round to zero are rejected.
5. Added regression coverage for simultaneous full collection, stock increments, duplicate cancellation, duplicate full refund, unpaid refund rejection and foreign-shop product/customer/invoice access. The test serializes local database writers; it is not a remote multi-process load benchmark.
6. Static quality audit still searched for old Supabase query syntax. It now recognizes current server catalog search and the 250-product initial load. Passing this static check is not proof of catalog completeness offline.

## Release blockers, in priority order

| Priority | Finding | Required acceptance evidence |
| --- | --- | --- |
| P0 | Refund reporting is inconsistent: report payment breakdown sums positive refund records as collections; invoice-based sales/GST exclude full refunds but do not consistently subtract partial credits. | Paid sale, partial refund and full refund reconcile across cash totals, sales, tax, customer ledger and reports with regression tests. No taxation certification is claimed. |
| P0 | Manual dues collection, stock adjustment and partial refund do not yet carry stable client operation IDs. A lost response followed by retry can create a second valid partial action. Transaction protection alone does not solve this. | Same operation ID retried after response loss changes payments/stock/credit exactly once, including two concurrent requests. |
| P0 | Production backup retention and a real staging restore have not been demonstrated. Local libsql restore passed only. | Restore a production backup into isolated staging, reconcile invoice/payment/stock counts, document recovery time and backup ownership. |
| P0 | Historical committed credential revocation remains unverified. | Confirm revocation in the relevant provider and review deployment copies without sharing secrets. Current guards do not invalidate an old external credential. |
| P1 | Android distribution is incomplete: current local defaults are emulator API/no Firebase key, no release signing configuration was found in app build configuration, no accepted install/update or download URL. | Signed production APK, production connection, install/update test and durable signing-key backup; retain rollback artifact. |
| P1 | Physical offline lifecycle and exact 58mm printer acceptance missing. | Android and iPhone web tests: first online setup, network loss, restart, queued bills, reconnect, conflicts, repeated sync, printing failure/reprint. Verify Hindi and fractional quantity on named printer models. |
| P1 | No native iOS project was identified; generic Bluetooth/USB printer compatibility cannot be assumed. | Publish an explicit supported platform/printer matrix. Do not advertise an iOS native app or universal 58mm compatibility. |
| P1 | Authenticated Owner A / Owner B / Staff route coverage remains partial. | Exercise all resource and file routes, reports, staff management, disabled accounts and expired entitlements with real test identities in staging. |
| P1 | Live payment lifecycle not fully accepted. | Confirm production webhook activation, response-loss recovery, settlement and refund/support procedure. Sandbox and dashboard webhook probe are not settlement evidence. Any real money movement remains a deliberate separate action. |
| P1 | Availability, slow network and realistic catalog/load acceptance missing. | Test realistic shops/catalogs, sleeping API recovery, timeout handling and monitored error alerts. Background recovery cannot execute while the host is asleep. |
| P1 | Support/privacy/refund information and release traceability incomplete. | Publish actual support contact and reviewed policies; configure version/SHA/update URL; record rollback owner and steps. |

## Feature suitability and limitations

The project includes billing, fractional quantities, GST calculations, products/customers, stock, dues, returns, reports, owner/staff roles, manual subscription checkout, voice/photo-assisted drafts and offline web storage. Strengths verified here include transactional invoice creation, retry handling for invoices/Cashfree checkouts, tenant-scoped data access in inspected paths, draft validation and recovery tests.

AI output still needs review. Cloud AI and browser speech availability depend on provider/network/device; fully offline voice was not certified. Offline catalogs are snapshots with bounded loading and expiry, so an arbitrary large shop must be tested for missing products. AutoPay remains a later integration. Medical, restaurant, weighed-goods and other specialist workflows must not be inferred from generic retail support.

## Release sequence

1. Fix refund reporting and stable retry IDs; repeat financial regressions.
2. Verify credentials/backup restore and complete authenticated security checks.
3. Produce signed production APK and accept named phone/printer combinations.
4. Complete live payment acceptance, support/policies, monitoring and rollback.
5. Run 3–5 shops for 7–14 days with daily invoice, stock and payment reconciliation.
6. Release only the supported combinations after zero unresolved lost/duplicate bills, incorrect balances or tenant leaks in acceptance. Record remaining nonblocking limitations prominently.

No software audit can promise that shopkeepers will never encounter a problem. The release gate is demonstrated recovery and correct records under specified failures.
