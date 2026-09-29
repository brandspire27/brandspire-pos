# Brandspire POS — Phase 14
## Android Owner Controls: Dues, Inventory, Reports & Customer Ledger

This patch moves several high-value Owner workflows from web-only into the Android APK while preserving the existing Staff permission boundary.

### Added Android Owner screens
- Dues & Payments
  - Lists invoices with outstanding balances.
  - Owner can record CASH / UPI / CARD / OTHER collections.
  - Uses the existing `collect_invoice_payment` RPC, so over-collection and non-Owner access are rejected server-side.
- Inventory
  - Owner-only Stock In / Stock Out.
  - Uses the existing `adjust_product_stock` RPC with audit logging and negative-stock protection.
  - Refreshes the local product cache after a successful adjustment.
- Reports
  - 7 / 30 / 90 day range.
  - Sales, collected, due, average bill, bill count.
  - GST summary (CGST / SGST / IGST / taxable sales).
  - Payment breakdown, top products and low-stock summary.
- Customer Ledger
  - Uses cached customers for fast selection.
  - Loads the authenticated Owner ledger from `get_customer_ledger`.
  - Shows invoice, payment, credit-note/refund entries and running balance.

### Security
These screens are only linked from the Android home screen when `role == OWNER`, but that is not the security boundary. The existing PostgreSQL RPCs also verify the authenticated user has the OWNER role for the organization.

Staff still cannot manage dues, inventory, Owner reports or customer ledgers through these RPCs.

### Install
1. Extract this patch.
2. Copy the contents into the existing `brandspire-pos-starter` project root.
3. Choose Replace for matching files.
4. No Supabase migration is required if Phases 5, 6 and 8 were already applied.
5. No npm install or new Gradle dependency is required.
6. Rebuild a fresh Android debug APK and install it.

### Test order
1. Start Brandspire POS backend/web normally if you use them for other testing.
2. Android Owner login.
3. Sync Products & Customers once.
4. Dues & Payments:
   - Create/choose an invoice with a due amount.
   - Receive a partial payment.
   - Reopen and receive the remaining balance.
5. Inventory:
   - Stock In +5 for a test product.
   - Confirm new stock.
   - Stock Out -2.
   - Attempt an invalid stock-out that would go negative when negative stock is disabled; it should be rejected.
6. Reports:
   - Test 7 / 30 / 90 day ranges.
   - Verify sales and GST numbers approximately match web reports.
7. Customer Ledger:
   - Select a customer with bill/payment history.
   - Verify invoice/payment/credit-note events and running balance.
8. Staff login:
   - Confirm these Owner controls are not shown.

### Intentional limitation
These Owner management screens need an internet connection because they update/read authoritative financial and inventory data from Supabase. Offline billing and cached counter operations remain separate and continue to work as designed.
