# Brandspire POS - Phase 21: Final Launch Readiness

Adds production/staging safety helpers, API runtime validation, request IDs and safe 5xx errors, a public release/maintenance endpoint, Android version/update awareness, a web status page, release preflight checks, and launch/backup runbooks.

No Supabase migration and no new npm/Gradle dependency are required.

## New API endpoint
- `GET /api/health/release`

## Android
Version is now `0.4.0` / versionCode `4`. Home checks the release policy when online. If this request fails, offline billing is not blocked.

## Preflight
- `npx pnpm@11.24.0 release:check`
- `npx pnpm@11.24.0 release:check:prod`
- later, after Cashfree production setup: `npx pnpm@11.24.0 release:check:prod-payments`

## Templates
- `apps/api/.env.production.example`
- `apps/web/.env.production.example`
- `apps/android/gradle.release.properties.example`

## Status page
Open `/status` after API and Web are running.

Read `docs/LAUNCH_CHECKLIST.md` and `docs/PRODUCTION_BACKUP_AND_RECOVERY.md` before production launch.
