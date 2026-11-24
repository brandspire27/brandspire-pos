# BrandSpire launch acceptance checklist

Updated 15 November 2026. See RELEASE_AUDIT_2026-11-15.md for fresh evidence and remaining blockers. This checklist replaces Supabase-specific assumptions with the current Firebase/Turso stack.

- [x] Payment reconciliation, rollback/retry and duplicate activation regression tests
- [x] Sandbox hosted checkout success and bank-decline scenario
- [x] Background recovery and pending checkout reuse implemented and deployed
- [x] Local database copy/restore and post-restore invoice retry drill
- [x] Actual browser tab-close/reopen preserves two queued bills in an isolated origin
- [ ] Production Turso backup retention and staging restore verified
- [ ] Live production payment, webhook activation and settlement accepted
- [ ] Real Android and iPhone offline launch/restart/reconnect matrix
- [ ] Exact 58mm printer models accepted for each supported transport/platform
- [x] Android fractional quantity/raster encoder implemented; debug build and three unit tests pass
- [ ] Hindi raster output visually accepted on the exact physical printer
- [x] Local transaction regression checks for concurrent collections, stock adjustment, cancellation and refund
- [x] Refund event reporting and manual mutation retry IDs implemented with local regression checks
- [ ] Financial changes accepted in staging/production, including rounding edge cases and client rollout
- [ ] Signed Android release configuration and physical install/update accepted
- [ ] Owner A / Owner B / Staff isolation independently verified across all routes
- [ ] Resolve and verify historical credential revocation recorded in SECURITY-REVIEW.md
- [ ] Refund/dispute process, alerts, support ownership and rollback drill
- [ ] Load/slow-network tests and service availability targets agreed
- [ ] Controlled 3-5 shop pilot for 7-14 days with daily reconciliation

Pass criteria: no missing/duplicate invoices or double deductions, monetary totals reconcile, rejected sync conflicts retain recoverable drafts, printer failures preserve bills, no tenant leakage, and a successful restore drill. Do not interpret a sandbox test or automated test suite as public-release certification.
