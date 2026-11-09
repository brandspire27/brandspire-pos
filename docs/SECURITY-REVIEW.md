# Security review

## Finding

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | HIGH | `apps/api/.env.production.example` | 10 (reviewed revision) | A server-side Supabase secret was committed in a tracked production environment example. Anyone with access to the repository/history could retrieve it; if still valid, it may grant privileged access that bypasses row-level security. | 9/10 |

### Remediation status

- **Repository working copy:** Fixed. The value in the example was replaced with `YOUR_SUPABASE_SECRET_KEY`; examples contain placeholders only.
- **Credential revocation/rotation:** Required, not verifiable or executable from this repository workspace. Revoke the exposed key in the Supabase project, issue a replacement only to trusted deployment secret stores if the legacy service is still needed, and check hosting/CI copies. Do not paste keys into chat or commit them.
- **Git history:** Not rewritten. The previous committed value may still be retrievable from repository history, forks, clones, caches, and deployment artifacts. Coordinate any history purge with repository administrators after rotating the credential; a history rewrite does not replace credential rotation.

## Unresolved security risks

- The application remains Supabase-backed at runtime. Direct web/Android data calls and NestJS database/auth paths have not yet been moved to Firebase/Turso; removing legacy configuration now would break current operations.
- The added Firebase verifier is not wired into all routes, and new Turso/R2 services are not yet the authorization-enforced source of truth.
- R2 object ownership checks in the service are not yet connected to authenticated membership checks and Turso file metadata in controller routes.
- Production Firebase, Turso, R2, and Cashfree security settings and deployment credentials were not available for verification.
- Deployed database policies, webhooks, backups, key validity, and tenant-isolation behavior could not be inspected against external services.

This is a bounded repository review, not a certification that the application is secure or production-ready.
