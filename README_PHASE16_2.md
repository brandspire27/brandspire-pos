# Brandspire POS — Phase 16.2 Smart Barcode Product Lookup

## What changed

Unknown barcodes can now be looked up automatically before a product is created.

Lookup order:
1. Existing Brandspire inventory (fastest)
2. Saved smart-barcode lookup cache on the Android device
3. Public Open Facts product databases (Food / Beauty / Products)
4. Manual add fallback

When public details are available, Brandspire POS pre-fills the product name and shows available brand/category/source information. Selling price, GST and stock remain user-confirmed because store pricing/tax/stock must not be blindly trusted from third-party product data.

## Android flows

### Products → Add Product
- Scan barcode
- Brandspire checks existing inventory first
- If new: online/public lookup runs automatically
- Product name is pre-filled when found
- Brand/category/source are shown as reference
- Owner/Staff confirms selling price, GST and opening stock
- Save Product

### Create Bill → Scan unknown barcode
- Existing inventory match → instantly add to cart
- Unknown barcode → smart online lookup
- Found → Add Product dialog opens already pre-filled
- Not found → manual product form fallback
- Save & Add to Bill → product is saved to inventory and added to the current cart

## Offline behavior
- Existing inventory barcodes continue to work offline.
- A barcode that was previously found through Smart Lookup can be recognized from the device lookup cache.
- A completely new public lookup requires internet.

## Important data rule
Third-party product databases are reference data only. Brandspire POS does not automatically trust third-party selling price, GST or stock.

## Installation
Copy the contents of this patch into the Brandspire POS project root and replace matching files.

No Supabase migration.
No new Gradle dependency.
No npm install.

Rebuild the Android APK after applying the patch.
