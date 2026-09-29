# Brandspire POS — Phase 4

This update focuses on product polish and real Owner operations.

## Adds

- Slimmer premium Owner navigation with real SVG icons
- Cleaner typography, spacing, cards and counter interactions
- Invoice item table fix (no desktop horizontal scrollbar)
- Owner Staff Management
  - Create Staff account
  - Activate/deactivate Staff access
  - Reset temporary Staff password
  - Server-side Owner authorization
  - Audit logs for Staff actions
- Business Settings
  - Business identity and GSTIN
  - Address / city / state / pincode
  - English / Hinglish / Hindi preference
  - Invoice prefix
  - Default payment method
- Printer Settings
  - 2-inch / 58mm
  - 3-inch / 80mm
  - A4
  - Receipt header/footer
  - Print copies preference
  - GSTIN visibility preference
- Staff discount policy
  - Off by default
  - Optional Owner-defined percentage limit
  - Enforced at database level even if someone bypasses the UI
- Billing counter reads default payment and Staff-discount policy
- Printed receipt uses configured header/footer and GSTIN visibility

## Install

1. Copy this update over the existing `brandspire-pos-starter` folder and replace matching files.
2. Do NOT replace your `.env`, `.env.local`, API `tsconfig.json`, or package-manager fixes.
3. In Supabase SQL Editor run:

   `supabase/migrations/0004_staff_business_printer_settings.sql`

4. Restart:

   `npx pnpm@11.24.0 dev`

## Test

1. Owner > Settings: save business details, language and printer default.
2. Owner > Staff: create a test Staff account.
3. Log out and log in using that Staff email + temporary password.
4. Confirm Staff can Add Customer, Add Product, Create Bill.
5. Confirm Staff cannot open Owner pages or delete/manage settings.
6. Owner > Staff: deactivate the Staff account and confirm it loses tenant access.
7. Create an invoice and confirm its detail table fits desktop width without horizontal scrolling.
8. Print preview: verify 58mm / 80mm / A4 and configured receipt footer.

## Security note

Staff creation/reset/deactivation goes through the NestJS API using the Supabase service role only on the backend. The browser never receives the service-role key.
