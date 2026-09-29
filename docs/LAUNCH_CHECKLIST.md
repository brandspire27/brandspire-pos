# Brandspire POS - launch checklist

## Environments
- [ ] Separate staging and production Supabase projects (recommended).
- [ ] Production API and web use HTTPS.
- [ ] Production clients contain only public/anon values.
- [ ] Service-role, Cashfree secrets and AI key exist only on trusted backend secret storage.
- [ ] CORS lists exact production web origins.

## Database & security
- [ ] All migrations applied in order.
- [ ] Phase 15 tenant-isolation/security tests pass on staging.
- [ ] RLS verified for Owner A vs Owner B and Staff.
- [ ] Backup/restore drill completed.
- [ ] Admin audit logs verified.

## Billing & offline
- [ ] Offline customer/product/bill -> sync passes.
- [ ] Duplicate client_invoice_id retry creates one invoice only.
- [ ] Printer failure never removes a bill.
- [ ] Stock restore/cancel/refund/partial-payment flows verified.

## Android release
- [ ] Increment versionCode/versionName for every distributed APK.
- [ ] API min/recommended Android versions reviewed.
- [ ] Release APK tested on a real Android phone.
- [ ] 58mm/80mm printers tested on actual target hardware before claiming compatibility.

## Payments
- [ ] Cashfree remains sandbox until merchant onboarding/KYC is complete.
- [ ] Webhook signature and duplicate-event tests pass before production payments.
- [ ] Payment activation is server/webhook verified, never client-success only.

## Observability
- [ ] /api/health = ok.
- [ ] /api/health/ready = database ok.
- [ ] /api/health/release shows expected version/environment.
- [ ] /status loads against deployed API.
- [ ] Request IDs appear in API error responses/logs.

## Final gate
```powershell
npx pnpm@11.24.0 release:check:prod
```

After Cashfree production credentials are configured:
```powershell
npx pnpm@11.24.0 release:check:prod-payments
```
