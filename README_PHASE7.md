# Brandspire POS — Phase 7

## UX, language consistency, faster startup & Brandspire Assist

Phase 7 focuses on making the existing product feel faster, more natural and easier to understand instead of adding another large business module.

### What changed

- Central English / Hinglish / Hindi copy expanded across the main Owner and Staff operational screens.
- Dues & Payments is fully localized instead of mixing Hinglish with English labels.
- Premium Brandspire POS workspace loader replaces the plain loading card.
- Dashboard shell appears earlier and uses skeleton values while business metrics refresh.
- New `get_current_workspace()` Supabase RPC reduces the authenticated workspace bootstrap to one database call.
- A short-lived local workspace cache is used only for loading-language/UI continuity. Database RLS and backend authorization remain the security boundary.
- Added **Brandspire Assist — Offline Help** to Owner and Staff workspaces.
- Brandspire Assist works from bundled product-help knowledge after the app has loaded; it does not send business data to an AI provider.
- Staff does not receive Owner-only help topics such as Staff management or stock adjustment.
- Help answers follow the selected English / Hinglish / Hindi language.
- Cleans the Next.js `scroll-behavior` development warning.

## Important: Brandspire Assist vs online AI

The Phase 7 offline assistant is intentionally a local product-help assistant, not a cloud generative model. This makes it fast, predictable and usable without internet once the app assets are available.

Future online AI remains separate and can provide tenant-isolated Owner insights using controlled tools such as sales summary, top products and low-stock analysis. Staff should not receive sensitive financial AI insights by default.

## Install

1. Copy this update over the Brandspire POS project and replace matching files.
2. In Supabase SQL Editor run:
   `supabase/migrations/0007_fast_workspace_bootstrap.sql`
3. Restart the development server:
   `npx pnpm@11.24.0 dev`

No new npm package is required.

## Test checklist

1. Owner Settings → choose Hinglish → Save Settings.
2. Refresh Owner Dashboard. Loader and normal labels should use Hinglish.
3. Open Dues & Payments. Headings, buttons, empty states and instructions should be Hinglish.
4. Switch to Hindi and verify the same screens.
5. Open Customers, Products, Inventory, Bills, Reports, Staff and Settings.
6. Click **Brandspire Assist** in the bottom-right and ask `Printer connect kaise karu?` or use a suggested question.
7. Login as Staff and confirm Brandspire Assist does not offer Owner-only management instructions.
8. Test with DevTools network throttling: the premium loader should appear briefly, then the shell should render while dashboard values use skeletons.

## Security note

The local workspace cache is a UX optimization only. It does not grant database or API access. Supabase RLS, role checks, tenant filters and backend authorization continue to enforce permissions.
