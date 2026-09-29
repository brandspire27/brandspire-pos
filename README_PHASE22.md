# Phase 22 — Staging Deployment

This phase adds staging-safe environment templates, public-HTTPS validation, a deployable API Dockerfile, Android staging config, and an automated staging smoke test.

No Supabase migration and no new npm/Gradle dependency are required.

Important: staging should use a separate Supabase project and Cashfree Sandbox, never production customer data.

After copying this patch, follow `docs/STAGING_DEPLOYMENT.md`.
