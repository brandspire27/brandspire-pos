# Brandspire POS Phase 16.1 — Barcode + Quick Product During Billing

This hotfix adds two counter-workflow improvements requested after Phase 16.

## 1. Barcode while creating inventory products
- Android Products screen now shows a **Scan** button beside the Barcode field.
- Scanning fills the barcode automatically.
- Existing duplicate barcode is flagged before save.

## 2. Add a new product while creating a bill
- Create Bill now has **+ Add New Product to Inventory**.
- If a barcode is scanned and no matching product exists, Brandspire POS asks whether to create it.
- Quick-add fields: Product Name, Selling Price, GST, Opening Stock, SKU, Barcode.
- On save, the product is created in the tenant inventory, the local product cache is refreshed, and the new product is automatically added to the current cart.
- Creating a brand-new product requires internet so authoritative inventory stays server-safe; existing cached products can still be billed offline.
- Staff can use this because Brandspire POS business rules already allow Staff to add products and create bills.

## Install
Copy the contents of this patch into the existing `brandspire-pos-starter` folder and replace matching files.

No Supabase migration, npm package, or new Gradle dependency is required.

Rebuild the Android debug APK and reinstall it.
