# Brandspire POS — Phase 10
## Android Login + Offline Cache/Sync + Thermal Printer Test UI

Razorpay Phase 9 can remain unconfigured for now. This patch advances the Android/real-shop path without requiring Razorpay keys.

### What is added

- Native Android Supabase email/password login.
- Encrypted Android Keystore session storage (no service-role key in APK).
- Tenant-safe workspace bootstrap through the existing `get_current_workspace()` RPC.
- Role-aware Owner/Staff Android home foundation.
- Local SQLite cache for products/customers.
- Durable pending-invoice queue with client-generated UUIDs.
- WorkManager retry when network is available.
- Offline sync uses the existing `create_pos_invoice()` RPC and `p_client_invoice_id`, so retry is idempotent.
- ONLINE / OFFLINE / SYNCING / SYNC FAILED foundation.
- Bluetooth + USB printer discovery/test UI.
- 58mm / 2-inch and 80mm / 3-inch ESC/POS test receipts.
- Offline Brandspire Assist help screen.

### No Supabase migration is required

Phase 10 reuses:
- `get_current_workspace()` from Phase 7
- `create_pos_invoice()` / client invoice idempotency from the core billing phase

### Android configuration

Open:

`apps/android/gradle.properties.example`

Copy the three BRANDSPIRE lines into `apps/android/gradle.properties` and fill in your real Supabase URL + anon/publishable key.

Never put the Supabase service-role key, Razorpay secret or AI provider secret in Android.

For Android Emulator:
`BRANDSPIRE_API_BASE_URL=http://10.0.2.2:3001`

For a real phone on the same Wi-Fi, use your Windows PC LAN address, for example:
`BRANDSPIRE_API_BASE_URL=http://192.168.1.20:3001`

### Open Android Studio

Open the folder:
`C:\BApos\brandspire-pos-starter\apps\android`

Allow Android Studio to sync the Gradle project and install SDK 35/build tools if requested.

### First Android test

1. Run the app on an emulator or Android device.
2. Login with an already-approved Brandspire POS Owner or Staff account.
3. Verify business name, role and subscription state are shown.
4. Tap `Sync Products & Customers` while online.
5. Turn internet off and reopen the app. The local/offline shell should remain available.
6. Open `Brandspire Assist` while offline.
7. Open `Printer Setup`.
8. Pair a Bluetooth thermal printer in Android Settings, or attach a USB printer.
9. Run 58mm or 80mm `Test Print`.

### Important printer limitation

The Android adapters use actual Bluetooth Classic / USB Host APIs and real ESC/POS bytes, but compatibility must be tested with the exact printer model. Do not claim every thermal printer works until physical tests pass.

Many low-cost ESC/POS printers cannot print Devanagari/Hindi text directly. A future patch should rasterize Hindi receipts as bitmaps for printers lacking the required glyphs.

### Current intentional limitation

The `CREATE BILL` Android button is still a foundation action; the full cached-product billing counter UI is the next Android patch. The local database, secure session, catalog cache, idempotent pending invoice queue and sync worker required for that screen are now in place.
