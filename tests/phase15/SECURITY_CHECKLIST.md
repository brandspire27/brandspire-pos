# Phase 15 acceptance checklist

- [ ] API `/health` returns 200.
- [ ] API `/health/ready` returns 200 and `database: ok`.
- [ ] Staff token is rejected by Owner API.
- [ ] Staff token is rejected by Owner subscription API.
- [ ] Owner/Staff tokens are rejected by Admin API.
- [ ] Staff cannot delete customer/product through direct REST calls.
- [ ] Owner A cannot read Owner B customer/invoice through RLS.
- [ ] Staff cannot collect later payments.
- [ ] Staff cannot cancel finalized invoices.
- [ ] Concurrent duplicate `client_invoice_id` requests return the same invoice.
- [ ] Concurrent independent bill requests produce unique invoice numbers.
- [ ] Local read-only load smoke records p50/p95/p99 and zero/acceptable errors.
- [ ] No claim of 10,000-tenant readiness is made from local testing alone.
