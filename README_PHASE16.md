# Brandspire POS — Phase 16 Professional Launch UI/UX

This patch is a visual/professional-launch refinement for the existing Brandspire POS codebase.
It does not change billing, tenant isolation, sync idempotency, printer adapters, database schema, or Razorpay logic.

## Included

### Android
- New Brandspire launch design system (`LaunchDesign.kt`)
- Professional login screen
- Branded launch/loading state
- Redesigned Owner/Staff Home with hero workspace card
- Compact status chips and premium quick-action grid
- Bottom navigation for Home / Bill / Bills / Assist
- Redesigned Create Bill counter with fixed total/action bar
- Improved customer/product forms and list cards
- Redesigned Bills history + pending sync status
- Professional Bill Success / print/share workflow
- Redesigned Printer Setup with default printer and auto-print control
- Redesigned Brandspire Assist offline help
- Better thermal receipt preview
- Shared Owner mobile UI helpers now use the launch design system
- Brandspire Android theme, status bar/navigation bar and launch background

### Web
- Professional launch design-token pass through `app/globals.css`
- Refined Owner sidebar and page hierarchy
- Refined Staff workspace header/navigation
- Premium landing/auth styling
- Refined cards, metrics, subscription banner, billing/invoice surfaces
- Refined loading and Brandspire Assist surfaces
- More consistent responsive behavior and subtle motion

## Install

1. Extract the Phase 16 ZIP.
2. Copy everything inside the extracted folder into the root of your existing project:

   `C:\BApos\brandspire-pos-starter`

3. Choose **Replace files** when Windows asks.

## Database / packages

- No Supabase migration.
- No new npm package.
- No new Android Gradle dependency.
- Existing Java/Kotlin JVM 17 configuration remains untouched.
- Existing Supabase/Razorpay environment files remain untouched.

## Restart web/API

```powershell
cd C:\BApos\brandspire-pos-starter
npx pnpm@11.24.0 dev
```

## Rebuild Android APK

Android Studio:

`Build → Build Bundle(s) / APK(s) → Build APK(s)`

Install the new `app-debug.apk` over the current test build.

## Test checklist

### Android
1. Login looks branded and professional.
2. Owner Home loads with Business hero, status, stats and bottom navigation.
3. Staff Home does not expose Owner-only controls.
4. Create Bill → search/scan → cart → quantity → payment → Save Bill.
5. Bill success → print → preview → A4 share.
6. Customers → add/search.
7. Products → add/search/barcode visibility.
8. Bills → pending sync + local receipts + server history.
9. Printer Setup → default 58/80mm → Test Print → auto-print.
10. Brandspire Assist → offline help.
11. Offline billing and sync behavior remains unchanged.

### Web
1. Landing / Login.
2. Owner Dashboard and sidebar.
3. Billing page.
4. Invoice detail / print panel.
5. Staff workspace.
6. Settings, Reports, Dues, Ledger and Returns pages.
7. Mobile/tablet responsive view.

## Important

This phase is deliberately visual. If any functional flow behaves differently after applying it, stop testing that flow and report the exact screen/error before changing backend/database code.
