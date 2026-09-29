# Brandspire POS — Phase 5

This update adds the first owner reporting/inventory layer and real invoice PDF/share actions.

## Added
- Owner Reports page: sales, collections, dues, average bill, daily sales, payment mix, top products, staff-created bills, low stock.
- Owner Inventory page with audited Stock In / Stock Out.
- Owner-only `adjust_product_stock` RPC with negative-stock protection.
- Owner-only `owner_report_summary` RPC for bounded report ranges.
- Barcode/SKU counter improvement: scan/type an exact barcode or SKU and press Enter to add the product instantly.
- A4 PDF invoice download using jsPDF.
- Native PDF sharing on supported browsers/devices.
- WhatsApp-friendly invoice message action.
- Owner sidebar now includes Inventory and Reports.

## Important boundaries
- Direct Bluetooth/USB thermal printer control is still reserved for the Android native printer bridge. Browser printing continues to use installed printer drivers.
- The WhatsApp button sends an invoice summary message. The Share PDF button uses the native Web Share API when file sharing is supported, allowing the PDF to be shared to WhatsApp or another installed app.
- No public invoice URL is created in this phase, so private invoice data is not exposed through a predictable link.

## Install
1. Copy this update over the current Brandspire POS project and replace matching files.
2. Run `supabase/migrations/0005_reports_inventory_sharing.sql` in Supabase SQL Editor.
3. Run `npx pnpm@11.24.0 install` because the web app now uses `jspdf`.
4. Restart with `npx pnpm@11.24.0 dev`.

## Test
1. Owner > Inventory > select product > Stock In 5 > confirm stock/movement changes.
2. Try Stock Out larger than current stock while Negative Stock is OFF > request must be rejected.
3. Owner > Reports > switch 7 / 30 / 90 day ranges.
4. Create a bill by typing/scanning an exact barcode/SKU and pressing Enter.
5. Open an invoice > Download PDF.
6. On a supported phone/tablet/browser > Share PDF and choose a sharing app.
7. Click WhatsApp and confirm the invoice summary is pre-filled.
