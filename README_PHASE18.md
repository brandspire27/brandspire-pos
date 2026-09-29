# Brandspire POS — Phase 18
## Offline Operations & Sync v2

This patch upgrades the Android counter app from "offline bills only" to a broader offline-first workflow.

### Added

- Add Customer while offline. It appears immediately in local customer search and can be used in a queued bill.
- Add Product while offline. It appears immediately in inventory/search and can be billed before internet returns.
- Create a new product directly from Create Bill while offline.
- Local temporary UUIDs are safe to reference from queued bills.
- Unified sync order: Customers -> Products -> Invoices.
- Conflict-safe retry logic:
  - retries first check the same local UUID;
  - customer exact phone/email matches are reused;
  - product exact barcode/SKU matches are reused;
  - queued invoice references are rewritten automatically if the server row uses another UUID.
- Atomic local bill save + local stock reservation, reducing duplicate/offline oversell risk.
- Pending/failed Sync Center for Customers, Products and Bills.
- Failed print retry queue.
- Failed thermal prints never remove the saved bill.
- Cached workspace support so the Android app can reopen into the Owner/Staff workspace without internet after at least one successful online login/workspace load.
- Server catalog refresh preserves unsynced local records.

### No backend migration required

This phase uses the existing Products, Customers and create_pos_invoice security/RLS model. No Supabase SQL migration and no new Gradle dependency are required.

### Install

Extract this update and copy the contents into the existing project root:

`C:\BApos\brandspire-pos-starter`

Replace matching files.

Then rebuild Android:

Android Studio -> Build -> Build Bundle(s) / APK(s) -> Build APK(s)

### Recommended verification

1. Log in online once so the workspace and catalog are cached.
2. Turn internet OFF and restart the app. Home should still open using the cached workspace.
3. Offline: add a customer. It should show as PENDING.
4. Offline: add a product with opening stock and optional barcode. It should show as PENDING.
5. Offline: create a bill using the new local customer/product. The bill should save, stock should reduce locally, and Sync Center should show the queued records.
6. Turn internet ON and open Sync Center -> Retry Sync.
7. Refresh Sync Center. Customer -> Product -> Bill should clear from the queue after successful sync.
8. Confirm the final server invoice exists only once and has a normal Brandspire invoice number.
9. Disconnect the printer and print a saved bill. The bill must stay saved and the failed print should appear in Print Retry Queue.
10. Reconnect the printer -> Sync Center -> Retry Prints. The print queue should clear after success.

### Notes

- Online barcode lookup still needs internet for a brand-new unknown barcode. Manual product creation now works offline.
- Exact server barcode/SKU conflicts are merged to the existing product instead of creating a duplicate. Exact customer phone/email matches are similarly reused.
- Subscription/RLS checks remain server-side. Offline work can be queued, but the server can still reject sync later if the account is no longer allowed to transact. The Sync Center will show that failure rather than deleting local data.
- No claim is made that all printer hardware is compatible; test the actual 58mm/80mm hardware before production launch.
