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

## Product rules already represented in this starter
- Exactly three portals
- Admin approval before Owner activation
- Trial/subscription timeline fields
- Terms acceptance tracking
- English / Hindi / Hinglish i18n structure
- 2-inch (58mm), 3-inch (80mm), and A4 printing profiles
- Tenant-first PostgreSQL schema
- Supabase RLS starter policies

## Next implementation target
Finish Supabase project wiring, authentication callbacks, backend guards and the first Owner onboarding flow.
