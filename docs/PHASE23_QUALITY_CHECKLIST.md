# Phase 23 Quality Checklist

## Visual system
- [ ] Brand blue is consistent across Web and Android.
- [ ] Body text, helper text, borders, warnings, success and danger states remain readable.
- [ ] No random gradients/animations distract from billing.
- [ ] Small phone and 768–850px web layouts remain usable.

## UX
- [ ] Staff can create a bill with minimum navigation.
- [ ] Owner mobile navigation exposes the most-used areas.
- [ ] Empty, error, loading and success states are understandable.
- [ ] No destructive action is presented as a primary button.

## Accessibility
- [ ] Web Tab navigation is visible.
- [ ] Reduced Motion OS/browser preference removes decorative animation.
- [ ] Common Android action targets are at least 48dp.
- [ ] Android common controls/action cards have meaningful accessibility descriptions.

## Performance
- [ ] First billing catalog request stays capped.
- [ ] Full-catalog product search returns products outside the initial payload.
- [ ] Exact barcode/SKU Enter lookup works.
- [ ] Phase 15 load smoke still passes on staging.

## Security
- [ ] Supabase service role is absent from Web/Android config.
- [ ] Cashfree secret is absent from Web/Android config.
- [ ] Cashfree webhook still verifies exact raw body.
- [ ] `X-Powered-By` is disabled.
- [ ] Sensitive API responses are `no-store`.
- [ ] Security headers are present.
- [ ] Rate guard returns 429 rather than allowing unlimited abuse.
- [ ] Phase 15 tenant/RBAC tests still pass.

## Language/content
- [ ] English quick pass.
- [ ] Hinglish quick pass.
- [ ] Hindi quick pass.
- [ ] Active subscription copy says Cashfree, not Razorpay.
- [ ] Offline help matches current Sync v2 behavior.

## Release gate
- [ ] `quality:audit` = 0 failures / 0 warnings.
- [ ] `release:check` passes except intentionally deferred Cashfree warning.
- [ ] Android APK builds successfully.
- [ ] Web production build succeeds.
- [ ] No regression in bill save, offline sync, printer retry, staff restrictions, dues, reports or admin control.
