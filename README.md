# Brandspire POS

Brandspire POS is a billing, POS and business-management SaaS product by Brandspire.

## Core portals
- Admin
- Owner
- Staff

## Quick start
```bash
corepack enable
pnpm install
pnpm dev
```

## Runtime migration
The API and web application use Firebase Authentication, Firebase ID-token
verification, and Turso/libSQL-backed API operations. Cloudflare R2 is the
private object-storage target. Server-only Firebase Admin, Turso, and R2
credentials belong in `apps/api/.env`; Firebase browser settings and the API
base URL belong in `apps/web/.env.local`.

The Android client and some deployment/release documentation still require
migration from their Supabase configuration. The `supabase/migrations`
directory is preserved as historical schema lineage. This is a code-only
migration; it does not copy or modify existing Supabase data.
