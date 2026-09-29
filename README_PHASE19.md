# Brandspire POS — Phase 19: Notifications & Alerts

This patch adds an Android local-first notification center without changing billing, sync or printer data models.

## Included

- Owner **Notifications & Alerts** center.
- Low-stock warning (launch default: stock <= 5 units).
- Customer dues summary from cached customer balances.
- Sync failure + pending sync alerts.
- Failed/pending print retry alerts.
- Subscription expiry warnings at <= 7 days and critical warning at <= 3 days.
- Expired/suspended/cancelled subscription alert.
- Brandspire Admin message surfaced in the alert center.
- Android system notification summary for warning/critical items.
- Android 13+ notification permission requested only when the user opens the alert center and chooses **Enable alerts**.
- Background sync refresh can publish a new alert summary when the alert state materially changes.
- Duplicate notification spam protection using a local alert fingerprint.
- English / Hinglish / Hindi alert copy.

## Install

1. Extract this ZIP.
2. Copy the `apps` folder into the Brandspire POS monorepo root.
3. Replace matching files.
4. No Supabase migration is required.
5. No new Gradle dependency is required.
6. Rebuild the Android APK.

## Test

### Low stock
Set/sync a product stock to 5 or below. Owner Home -> Alerts should show Low Stock.

### Dues
Use a customer with an outstanding balance. Sync customers. Owner Home -> Alerts should show a dues summary.

### Sync failure
Cause a queued record to fail sync. Alert Center should show a critical sync warning.

### Print retry
Disconnect the printer and force a print failure. Alert Center should show the print retry warning.

### Subscription
Use a test Owner whose `ends_at` is within 7 days to verify the renewal warning.

### Android device notification
On Android 13+, open Alerts -> Enable alerts -> Allow. Change an alert condition and reopen/sync. Brandspire POS should show a system notification summary.

## Notes

- Low-stock threshold is intentionally a conservative launch default of 5 units. A per-business configurable threshold can be added later.
- This phase is local-first. It does not require Firebase Cloud Messaging and does not claim remote push delivery when the app/device has never refreshed data.
- Staff authorization is unchanged. Owner-only business alerts remain Owner-only in the alert center.
