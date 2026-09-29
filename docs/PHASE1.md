# Phase 1 — Foundation

## Implemented in this starter
- Brandspire / Brandspire POS naming split
- pnpm + Turborepo monorepo
- Next.js web shell
- NestJS API shell
- Admin / Owner / Staff portal routes
- Supabase PostgreSQL starter migration
- First-time Owner application table
- English Terms acceptance audit structure
- Admin-controlled approval/subscription timeline fields
- English / Hindi / Hinglish message structure
- 58mm / 80mm / A4 print profiles
- RLS membership helpers and baseline policies

## Immediate next work
1. Create Supabase project and apply migration.
2. Add Supabase SSR clients in Next.js.
3. Build Owner signup form + Terms modal/document.
4. Submit `owner_applications` after authentication.
5. Build trusted Admin review endpoint to approve application and atomically create organization + OWNER membership + subscription.
6. Add NestJS JWT/session validation and ADMIN/OWNER/STAFF guards.
7. Add audit_logs and approval transaction.
8. Add security tests before Customers/Products/Billing.
