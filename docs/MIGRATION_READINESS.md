# Firebase, Turso, and R2 migration status

## Current architecture

Active application runtime paths use Firebase Authentication, the NestJS API backed by Turso/libSQL, and Cloudflare R2 for file objects. Web and Android clients send Firebase ID tokens to the API; neither client connects to Turso or R2 directly.

- **Identity:** Firebase Auth on the web and Android; Firebase Admin verifies ID tokens in API guards.
- **Structured data:** API services and tenant-scoped endpoints use Turso. The API handles authentication, membership checks, business operations, Cashfree records, and audit writes.
- **Object storage:** authenticated POS API endpoints upload files to R2, persist file metadata in Turso, and return short-lived signed download URLs.
- **Offline Android:** local cache and queued invoices remain; sync goes through authenticated API endpoints and keeps the client invoice ID for retry idempotency.
- **Legacy schema:** `supabase/migrations/` is retained as historical migration source only. It is not loaded by the application or migration runner.

## Data and deployment boundary

This code change does **not** transfer data, Firebase identities, or stored files. No remote database was accessed and no production data was changed. The new Turso database must be provisioned and populated/mapped from the previous source before existing users and businesses can operate against it. Preserve the source database and files until counts, tenant relationships, payment state, and object metadata are reconciled and a rollback plan is approved.

In particular, identity references must map to Firebase UIDs; platform administrators must be provisioned through a controlled server-side process. Do not infer roles from client-supplied metadata.

## Backend configuration

The API requires:

- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- `FIREBASE_PROJECT_ID` and either workload/application-default credentials or server-only `FIREBASE_SERVICE_ACCOUNT_JSON`.
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.
- Cashfree server credentials when subscription checkout/webhooks are enabled.

The web app requires public Firebase client configuration and `NEXT_PUBLIC_API_URL`. Android requires `BRANDSPIRE_FIREBASE_API_KEY` and `BRANDSPIRE_API_BASE_URL` in its local Gradle properties. Firebase API keys are client configuration; never ship Firebase service-account keys, Turso tokens, R2 secrets, or payment secrets to clients.

## Validation and remaining operational work

Source migration and local builds do not verify remote configuration or live data. Before production cutover:

1. Provision and migrate data into an isolated Turso database; record source/target counts and reconcile totals and tenant relationships.
2. Configure Firebase identities and the controlled admin allowlist/process.
3. Verify R2 upload/download authorization and file metadata against the deployed bucket.
4. Test Cashfree checkout, verified/idempotent webhooks, payment state, and audit records against staging.
5. Exercise Android online/offline billing, retries, multi-tenant cache isolation, and printer workflows on devices.
6. Verify database/object backups and restores, then approve a cutover and rollback window.

No live Firebase, Turso, R2, Cashfree, or signing credentials were used for this code-only migration. Production connectivity, data reconciliation, signed release validation, and a real device test remain unverified.
