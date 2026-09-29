# Brandspire POS — Phase 23: Pre-Launch Quality & Experience Audit

This patch is the final quality pass before staging. It focuses on UI/UX consistency, security hardening, billing speed, accessibility, language cleanup, and launch checks without changing tenant data or the billing schema.

## What changed

### Web UI / UX
- Final Brandspire design-token override: primary `#3155D9`, neutral business surfaces, consistent text/border/status colors.
- System typography stack standardized; no external font dependency is required.
- Strong keyboard `:focus-visible` states, high-contrast support, reduced-motion support, and 44px+ interactive targets.
- Owner and Staff now have a compact mobile bottom navigation for core workflows.
- Small-screen billing layout receives safer sticky search / spacing / touch-target polish.
- Cashfree naming is now consistent in the subscription translations; old Razorpay wording is removed from active web copy.

### Billing speed
- Initial product payload is reduced to 250 rows for faster first paint.
- Product search now falls back to the full tenant catalog through Supabase after a short debounce.
- Exact barcode / SKU Enter lookup also searches the server if the product is outside the initial payload.
- This keeps common counter operations fast while still supporting larger catalogs.

### API security
- Removes Express `X-Powered-By` fingerprint.
- Adds `nosniff`, frame protection, referrer policy, permissions policy, and HSTS in staging/production.
- Admin / Owner / Payment API responses are explicitly `no-store`.
- Adds a lightweight abuse guard with stricter limits for subscription checkout and authenticated mutations.
- Existing request IDs and Cashfree raw-body webhook verification remain intact.

> The new limiter is intentionally dependency-free and in-memory. It is useful for local/staging and a single API instance. Before horizontally scaling multiple production API replicas, replace the rate bucket storage with shared Redis so all replicas enforce one limit.

### Android quality
- Android shared UI colors are aligned with the final Brandspire palette.
- Common buttons now enforce 48dp minimum tap targets and accessibility labels.
- Shared inputs use a 52dp minimum height.
- Owner/Staff workspace, network state and dashboard stat labels are more language-consistent.
- Home action tiles expose accessibility descriptions.
- Create Bill online/offline state is localized.
- Brandspire Assist offline help was corrected to match Phase 18: customers/products can be created offline and safely synced later.

### Automated quality audit
Run from the repository root:

```powershell
npx pnpm@11.24.0 quality:audit
```

It checks client secret exposure, security headers, API cache protection, rate guard, Cashfree raw-body preservation, keyboard focus, reduced motion, mobile navigation, billing full-catalog search, Android tap targets, offline-help freshness, and active Cashfree naming.

Expected final line:

```text
Summary: 0 failure(s), 0 warning(s)
```

## Install

1. Extract this ZIP.
2. Copy its contents into:

```text
C:\BApos\brandspire-pos-starter
```

3. Replace matching files.

No Supabase migration is required.
No new npm package is required.
No new Gradle dependency is required.

## Restart web/API

```powershell
cd C:\BApos\brandspire-pos-starter
npx pnpm@11.24.0 dev
```

Then run:

```powershell
npx pnpm@11.24.0 quality:audit
npx pnpm@11.24.0 release:check
```

## Android

Build a fresh APK because shared Android UI code changed:

```text
Android Studio → Build → Build APK(s)
```

## Manual regression checklist

### Web
1. Owner login → Dashboard → Create Bill.
2. Resize browser below 850px and verify the new bottom navigation.
3. Staff login and verify only Staff core navigation appears.
4. Use keyboard Tab and confirm buttons/inputs show a visible focus ring.
5. In Create Bill, search a product that is beyond the first 250 catalog rows; it should still appear via full-catalog search.
6. Scan/type an exact SKU/barcode and press Enter; exact server lookup should add it even if it was not in the initial list.

### Android
1. Owner Home: verify blue palette, 48dp buttons and localized Online/Offline state.
2. Create Bill: verify Online/Offline label and normal billing flow.
3. Brandspire Assist → “What works offline?” and verify it mentions offline customers/products, pending bills and print retry queue.
4. English / Hinglish / Hindi quick pass.

### Security
1. Verify `/api/health` still works normally.
2. Check API response headers for `X-Content-Type-Options: nosniff`.
3. Admin/Owner API responses should include `Cache-Control: no-store`.
4. Existing Phase 15 security tests should still pass.

## Next step

After this patch passes regression, proceed to Phase 22 staging deployment. Do not treat local smoke tests as proof of large multi-instance production scale; perform staging load tests and real-device/printer testing before production launch.
