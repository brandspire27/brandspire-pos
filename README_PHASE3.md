# Brandspire POS — Phase 3 Premium UI + Staff Operations + Print Layouts

Copy this update into the existing `brandspire-pos-starter` root and replace matching files.

## What this update adds
- Premium visual refresh across landing, login, signup and POS workspaces.
- Cleaner Brandspire navy/cobalt identity, improved typography hierarchy and spacing.
- Smooth lightweight transitions with reduced-motion accessibility support.
- Fully usable Staff Dashboard.
- Staff Add Customer (add/search only, no delete).
- Staff Add Product (add/search only; no edit/delete or purchase-price exposure).
- Staff Create Bill using the same transactional billing RPC.
- Owner and Staff billing use a shared fast billing workspace.
- Staff discount is disabled by default until an Owner-configurable discount permission exists.
- Invoice detail screen.
- Real browser print layouts for 2-inch / 58mm, 3-inch / 80mm, and A4.
- Invoice Bill-To data and real stored payment data appear on invoice/receipt.
- Default printer format continues to come from `organization_settings.default_print_format`.
- Client invoice UUID is supplied to the billing RPC for retry/idempotency protection.

## Important printing scope
The web app now formats and sends the invoice to the browser/OS print dialog for 58mm, 80mm and A4. Direct Bluetooth/USB device control is intentionally NOT faked in the browser. That will be implemented through the Android printer bridge in the native printer phase.

## Database
No new SQL migration is required for this update. It uses the existing Phase 1 and Phase 2 schema/RLS/RPC.

## Run
```powershell
npx pnpm@11.24.0 dev
```

## Quick test
1. Owner: create a bill -> View & Print -> test 58mm / 80mm / A4 previews.
2. Staff: login -> Add Customer -> Add Product -> Create Bill -> View & Print.
3. Confirm Staff sees no delete controls and no Owner subscription/management controls.
