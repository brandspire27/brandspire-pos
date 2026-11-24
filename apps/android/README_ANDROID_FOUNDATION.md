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

The Android app connects through Firebase Authentication and the Brandspire POS API:

- Firebase Owner/Staff login
- Firebase ID tokens on authenticated Brandspire POS API requests
- Room/SQLite product + customer cache
- WorkManager sync queue
- bill creation with the same `client_invoice_id` idempotency used by the server
- printer discovery UI and saved default printer
- receipt rendering and asynchronous print jobs

For local/debug builds, set `BRANDSPIRE_FIREBASE_API_KEY` and `BRANDSPIRE_API_BASE_URL` in `apps/android/gradle.properties` (see the staging and release examples). Release builds should use environment variables, which take priority over Gradle properties. No production claim should be made until device and offline tests pass.

## Public Android preview download

The public download page is hosted at `/download` on Firebase Hosting, and the APK is a public GitHub Release asset because Firebase's Spark plan blocks executable APK uploads. Firebase App Distribution is invite-only and is not used for this link. The APK is an early-access preview (currently version `0.4.0`, Android 8+). Bluetooth/USB printer behavior and offline operation still require testing on the target devices.

Release builds must be signed with a private release keystore. Keep that keystore and its passwords backed up securely; never commit them. The Gradle release build reads these environment variables, with environment values taking priority over `gradle.properties`:

- `BRANDSPIRE_FIREBASE_API_KEY`
- `BRANDSPIRE_API_BASE_URL` (must be the production HTTPS API)
- `BRANDSPIRE_RELEASE_KEYSTORE_FILE`
- `BRANDSPIRE_RELEASE_STORE_PASSWORD`
- `BRANDSPIRE_RELEASE_KEY_ALIAS`
- `BRANDSPIRE_RELEASE_KEY_PASSWORD`

Build with `.\gradlew.bat :app:assembleRelease`, then publish the signed APK as a public GitHub Release asset named `brandspire-pos-<version>.apk`. Update the versioned URL on the Firebase `/download` page and deploy the static site to project `bsp-pos`; do not upload the APK to Firebase Hosting on the Spark plan. Direct APK installs do not update automatically; users need the same signing key for future updates.
