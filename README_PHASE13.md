# Brandspire POS — Phase 13

## Android Camera Barcode Scanner + Faster Counter Search

This patch adds camera barcode scanning to the Android Create Bill screen while preserving the existing offline billing, receipt printing, JVM 17 setup and printer architecture.

### Added
- Camera barcode scanner on **Create Bill**.
- Retail formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, ITF, Codabar, QR and Data Matrix.
- Auto-zoom for faster scanning.
- Exact barcode/SKU match adds the product directly to the cart.
- Unknown scans fall back to the existing product search instead of failing.
- English / Hinglish / Hindi scan labels and messages.
- Existing USB/Bluetooth barcode scanners that behave like keyboards still work through the search field.

### Google scanner behavior
The implementation uses Google Code Scanner from Google Play services. Brandspire POS itself does not request camera permission for this scanner flow. On a device where the scanner module is not already present, Google Play services may download it the first time scanning is used.

### Install
1. Extract this patch.
2. Copy everything inside into your main `brandspire-pos-starter` folder.
3. Replace matching files.
4. Android Studio -> **Sync Project with Gradle Files**.
5. Build a fresh debug APK and install it on the phone.

There is no Supabase migration and no npm install.

### Important Gradle note
`app/build.gradle.kts` intentionally keeps Java and Kotlin on JVM 17:
- Java source/target: 17
- Kotlin toolchain: 17

It also adds:
`com.google.android.gms:play-services-code-scanner:16.1.0`

### Test
1. Sync products to the phone first.
2. Ensure at least one product has a barcode or SKU in Brandspire POS.
3. Open **Bill Banao**.
4. Tap **Scan**.
5. Point the phone at the product barcode.
6. Exact match -> product should immediately be added to cart.
7. Scan the same product again -> quantity should increase by one, up to cached stock.
8. Scan an unknown code -> value should appear in search and show matching results if any.
9. Turn internet off after the scanner module has been installed and confirm cached-product billing still works.

### Not claimed yet
Camera scanning availability depends on compatible Google Play services on the Android device. Physical barcode and printer compatibility still needs testing on the actual shop hardware before production claims.
