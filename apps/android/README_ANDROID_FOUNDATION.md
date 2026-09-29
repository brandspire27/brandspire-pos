# Brandspire POS Android Foundation — Phase 6

This directory is the native Android starting point for the Brandspire POS APK.

## Included now

- Android application shell (`com.brandspire.pos`)
- 58mm / 80mm paper profiles
- ESC/POS byte encoder foundation
- Bluetooth Classic SPP adapter using Android's `BluetoothSocket`
- USB Host adapter using `UsbManager` + bulk OUT endpoint
- Offline sync state and client-generated invoice ID model

## Important hardware facts

The printer adapters are real Android API implementations, but they have **not been claimed as production-tested** because this build environment does not have your physical printers attached.

Before production, test at least:

1. Your exact 2-inch/58mm printer model.
2. Your exact 3-inch/80mm printer model.
3. Bluetooth permission flow on Android 12+.
4. USB permission intent and detach/reconnect behaviour.
5. ESC/POS cut/feed support for each model.
6. Hindi printing. Many cheap ESC/POS printers do not contain Devanagari glyphs; Brandspire POS should rasterize Hindi text to an image when the printer code page cannot render it.
7. Print retry and duplicate-print protection.

## Android Studio

Open `apps/android` as a project in Android Studio. If Android Studio asks to install Android SDK 35 / matching build tools, allow it.

The next Android phase will connect:

- Supabase Owner/Staff login
- Brandspire POS API
- Room/SQLite product + customer cache
- WorkManager sync queue
- bill creation with the same `client_invoice_id` idempotency used by the server
- printer discovery UI and saved default printer
- receipt rendering and asynchronous print jobs

No production claim should be made until device and offline tests pass.
