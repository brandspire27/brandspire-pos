# Brandspire POS — Staging Deployment

Use staging as a disposable pre-production environment. Keep staging Firebase,
Turso, and R2 resources separate from production; do not copy production secrets.

## Recommended layout

- Web: Vercel staging project / preview domain
- API: container host such as Northflank using `apps/api/Dockerfile`
- Auth: separate Firebase staging project
- Structured data: separate Turso staging database
- File storage: private Cloudflare R2 staging bucket
- Payments: Cashfree Sandbox only
- Android migration is not complete; its current build/runtime configuration still references Supabase.

## 1. Configure staging services

Create a Firebase staging project, Turso database, and private R2 bucket. Apply
the API migrations from `apps/api/migrations` in numeric order. The retained
`supabase/migrations` directory is historical only. Create only test
Admin/Owner/Staff accounts.

## 2. Deploy the API

Use repository root as Docker build context and `apps/api/Dockerfile` as the Dockerfile.

Set environment values from `apps/api/.env.staging.example`, including Firebase
Admin credentials, Turso credentials, and R2 credentials. `APP_ENV=staging` is
required. Set `WEB_URL` to the final staging web URL and `API_PUBLIC_URL` to the
final public API URL.

Health checks:

- `/api/health`
- `/api/health/ready`
- `/api/health/release`

The release endpoint must report `environment: staging`.

## 3. Deploy the web app

Use `apps/web` as the web project's root directory. Add values from `apps/web/.env.staging.example`. `NEXT_PUBLIC_API_URL` must point to the deployed staging API.

After the web URL is known, ensure the API `WEB_URL` exactly matches it (no trailing slash mismatch).

## 4. Build a staging Android APK

Android still contains Supabase-backed client paths and must not be considered
migrated or released against this target architecture yet.

## 5. Run smoke checks

PowerShell:

```powershell
$env:STAGING_API_URL="https://YOUR-STAGING-API.example.com"
$env:STAGING_WEB_URL="https://YOUR-STAGING-WEB.vercel.app"
npx pnpm@11.24.0 staging:smoke
```

All five checks should pass.

## 6. End-to-end staging test

Test Owner signup -> Admin approval -> Staff creation -> customer/product -> bill -> offline bill sync -> print -> dues -> reports -> suspension/restore -> audit trail.

Cashfree can remain unconfigured. When payment testing starts, use Cashfree Sandbox credentials only.

## Production gate

Do not copy staging URLs/keys into production. Create production environment values separately and run `release:check:prod` before launch. Use `release:check:prod-payments` only after Cashfree production credentials are approved and configured.
