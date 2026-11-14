# BrandSpire launch acceptance checklist

Updated 14 November 2026. This checklist replaces Supabase-specific assumptions with the current Firebase/Turso stack.

- [x] Payment reconciliation, rollback/retry and duplicate activation regression tests
- [x] Sandbox hosted checkout success and bank-decline scenario
- [x] Background recovery and pending checkout reuse implemented and deployed
- [x] Local database copy/restore and post-restore invoice retry drill
- [x] Actual browser tab-close/reopen preserves two queued bills in an isolated origin
- [ ] Production Turso backup retention and staging restore verified
- [ ] Live production payment, webhook activation and settlement accepted
- [ ] Real Android and iPhone offline launch/restart/reconnect matrix
- [ ] Exact 58mm printer models accepted for each supported transport/platform
- [ ] Android fractional-quantity and Hindi receipt rendering corrected and tested
- [ ] Signed Android release configuration and physical install/update accepted
- [ ] Owner A / Owner B / Staff isolation independently verified across all routes
- [ ] Resolve and verify historical credential revocation recorded in SECURITY-REVIEW.md
- [ ] Refund/dispute process, alerts, support ownership and rollback drill
- [ ] Load/slow-network tests and service availability targets agreed
- [ ] Controlled 3-5 shop pilot for 7-14 days with daily reconciliation

Pass criteria: no missing/duplicate invoices or double deductions, monetary totals reconcile, rejected sync conflicts retain recoverable drafts, printer failures preserve bills, no tenant leakage, and a successful restore drill. Do not interpret a sandbox test or automated test suite as public-release certification.
