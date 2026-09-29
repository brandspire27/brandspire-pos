# Brandspire POS — Phase 12 Android Receipt & Printing

Phase 12 completes the Android post-billing flow without changing the working JVM/Gradle configuration.

## Added
- Bill Success screen after every Android bill save
- Local receipt snapshot stored before sync
- Local receipt history / reprint from Bills
- Default printer saving
- 58mm / 80mm default paper profile
- Auto-print toggle
- Real ESC/POS receipt printing through the existing Bluetooth/USB adapters
- Receipt preview
- A4 PDF generation and Android Share sheet
- Offline receipt reference until final server invoice number is returned
- Sync worker updates local receipt with the final server invoice number
- USB permission request helper for printer test

## Critical safety rule
The bill is saved to the local queue before any print is attempted.

Bill save -> local receipt -> sync -> print/share

A printer failure cannot delete or lose the bill.

## Install
1. Copy the contents of this patch into the project root and replace matching files.
2. No Supabase migration is required.
3. No npm install is required.
4. No new Gradle dependency is required, so the existing JVM 17 fix remains untouched.
5. Build a fresh debug APK and install it over the current app.

## Test
1. Printer Setup -> pair/select a Bluetooth or USB printer.
2. Choose `Use 58mm` or `Use 80mm`.
3. Run a Test Print.
4. Optionally enable Auto-print.
5. Create a bill.
6. Confirm Bill Success appears.
7. Test Print Default Receipt.
8. Open Receipt Preview.
9. Share A4 PDF.
10. Open Bills -> This device -> Open / Reprint.
11. Create a bill with internet off and confirm an Offline Ref is shown.
12. Turn internet on and sync; reopening the local receipt should show the final server invoice number once sync completes.

## Notes
- Thermal receipts use ASCII-safe text for broad ESC/POS compatibility. Hindi merchant/product text may need a printer-specific raster/text adapter later because many low-cost thermal printers do not support Devanagari fonts natively.
- A4 PDF uses Android's built-in PDF APIs and does not depend on the thermal printer.
- Camera barcode scanning is intentionally kept out of this patch so the receipt/printer workflow can be validated without adding another Android dependency. It can be added in the next patch after this flow is stable.
