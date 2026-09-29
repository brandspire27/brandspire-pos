# Brandspire POS — Phase 4 Hotfix

Fixes:
- Settings crash: `Cannot read properties of null (reading 'trim')`
- React warning: input `value` must not be null
- Re-copies the Owner API module/routes used by Staff Management

After copying the hotfix into the project root, stop the dev server completely and start it again.

Expected API route after restart:
- `GET /api/owner/staff` (requires an Owner bearer token)

If Staff still shows `Cannot GET /api/owner/staff`, check the Nest terminal during startup. It must map the OwnerController routes. Also verify `apps/api/src/app.module.ts` imports `OwnerModule`.
