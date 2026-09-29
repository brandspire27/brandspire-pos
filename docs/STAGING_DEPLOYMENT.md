# Brandspire POS — Staging Deployment

Use staging as a disposable pre-production environment. Never point staging at the production Supabase database.

## Recommended layout

- Web: Vercel staging project / preview domain
- API: container host such as Northflank using `apps/api/Dockerfile`
- Database/Auth: separate Supabase staging project
- Payments: Cashfree Sandbox only
- Android: staging APK pointing to staging Supabase + staging API

## 1. Create a separate Supabase staging project

Run migrations `0001` through `0011` in numeric order. Create only test Admin/Owner/Staff accounts. Do not copy production service-role keys into client apps.

## 2. Deploy the API

Use repository root as Docker build context and `apps/api/Dockerfile` as the Dockerfile.

Set environment values from `apps/api/.env.staging.example`. `APP_ENV=staging` is required. Set `WEB_URL` to the final staging web URL and `API_PUBLIC_URL` to the final public API URL.

Health checks:

- `/api/health`
- `/api/health/ready`
- `/api/health/release`

The release endpoint must report `environment: staging`.

## 3. Deploy the web app

Use `apps/web` as the web project's root directory. Add values from `apps/web/.env.staging.example`. `NEXT_PUBLIC_API_URL` must point to the deployed staging API.

After the web URL is known, ensure the API `WEB_URL` exactly matches it (no trailing slash mismatch).

## 4. Build a staging Android APK

Copy the three entries from `apps/android/gradle.staging.properties.example` into local `apps/android/gradle.properties`, then build the APK. The API URL must be public HTTPS; do not use `10.0.2.2` or a laptop LAN address for staging.

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
