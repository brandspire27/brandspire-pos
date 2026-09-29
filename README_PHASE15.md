# Brandspire POS — Phase 15
## Security, Reliability & Performance Hardening

This phase is intentionally not a visual feature phase. It strengthens the foundation before the final Professional Launch UI/UX pass.

### What is added

- API liveness endpoint: `GET /api/health`
- API + database readiness endpoint: `GET /api/health/ready`
- Concurrency-safe offline invoice idempotency using a transaction-scoped PostgreSQL advisory lock keyed by organization + `client_invoice_id`
- Additional tenant-scoped product/customer lookup indexes
- Automated security/RLS test runner
- Automated invoice-idempotency and concurrent invoice-number test (opt-in, mutating)
- Read-only local/staging load-smoke runner with p50/p95/p99/error-rate/throughput output
- JSON reports under `tests/phase15/results/`

## Install

1. Extract the Phase 15 ZIP.
2. Copy everything inside it into the existing `C:\BApos\brandspire-pos-starter` folder.
3. Choose **Replace** for matching files.
4. No npm package is added.
5. Run `supabase/migrations/0010_security_reliability_hardening.sql` in Supabase SQL Editor.
6. Restart Brandspire POS:

```powershell
cd C:\BApos\brandspire-pos-starter
npx pnpm@11.24.0 dev
```

Verify in a browser:

- `http://localhost:3001/api/health`
- `http://localhost:3001/api/health/ready`

Both should return successful JSON.

## Configure automated tests

Copy:

```text
tests/phase15/.env.phase15.example
```

to:

```text
tests/phase15/.env.phase15
```

Fill the development/test Owner and Staff credentials. Never commit this file.

The minimum read-only security checks require:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OWNER_A_EMAIL`
- `OWNER_A_PASSWORD`
- `STAFF_EMAIL`
- `STAFF_PASSWORD`

For cross-tenant checks, add a separate approved Owner B account.

For database write/concurrency tests, create a throwaway product in Owner A's organization with at least 10 stock, put its UUID in `TEST_PRODUCT_ID`, then set:

```text
RUN_MUTATING_TESTS=true
```

The generated test invoices use CREDIT and are cancelled by the Owner after the assertion, so product stock is restored. Cancelled test invoices/audit history remain intentionally, because finalized business records should not be silently hard-deleted.

## Run security + reliability tests

With the API running:

```powershell
node .\tests\phase15\security-hardening.mjs
```

Expected examples:

```text
PASS Staff cannot enter Owner API
PASS Staff cannot access subscription API
PASS Owner cannot enter Admin API
PASS Staff cannot delete customer
PASS Owner A cannot read Owner B invoice
PASS Concurrent retry with same client_invoice_id is idempotent
PASS Concurrent invoice numbering stays unique
```

A JSON report is written to:

```text
tests/phase15/results/security-latest.json
```

## Run the read-only performance smoke test

```powershell
node .\tests\phase15\load-smoke.mjs
```

It measures:

- API health
- API readiness
- workspace bootstrap
- product search
- customer search
- invoice listing

and reports:

- p50
- p95
- p99
- error rate
- throughput

The default is intentionally modest and safe for local development.

### Important scalability statement

Passing this local test does **not** establish 10,000+ tenant capacity. The master specification requires realistic staged load testing with database connections, CPU, memory, queues, latency, and error-rate monitoring before any such claim is made.

## After Phase 15

Once these checks pass, the next phase should be the dedicated **Professional Launch UI/UX** pass across Android first, followed by web consistency, instead of continuing to layer prototype styling screen-by-screen.
