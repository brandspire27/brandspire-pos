# Brandspire POS — Phase 2 Core Update

This update adds the first real POS/business workflow on top of the working Phase 1 authentication + Admin approval foundation.

## Included

- Owner dashboard with live database metrics
- Subscription/trial hook banner
- Customers: add, search, soft-remove (Owner)
- Products: add, search, GST, price, stock, soft-remove (Owner)
- Fast Create Bill screen
- Transactional invoice creation in PostgreSQL
- Concurrency-safe invoice numbering
- GST calculation with CGST/SGST or IGST based on business/customer state
- Inclusive/exclusive GST product pricing
- Percentage or flat invoice discount
- Cash / UPI / Card / Credit payment modes
- Paid / partially paid / unpaid state
- Automatic stock reduction
- Customer outstanding balance update
- Inventory movement records
- Bill history
- English / Hindi / Hinglish labels foundation
- Staff dashboard remains intentionally restricted; Staff operation screens will be wired next with strict non-destructive permissions

## Install

1. Copy the contents of this update folder into your existing `brandspire-pos-starter` folder and replace matching files.
2. Do **not** delete or replace your `.env` / `.env.local` files.
3. In Supabase SQL Editor, run:

   `supabase/migrations/0003_core_pos.sql`

4. Restart the app:

   `npx pnpm@11.24.0 dev`

## Test order

1. Login as an already-approved Owner.
2. Open Products and create at least two products with stock.
3. Open Customers and add one customer; use the same state as your business first.
4. Open Create Bill, add products, choose customer and payment mode, then Generate Bill.
5. Confirm the bill appears in Bills.
6. Confirm product stock decreases.
7. For a Credit bill, confirm customer outstanding increases.
8. Create a customer in another state and generate a bill to exercise IGST logic.

## Important

Printing is deliberately not connected in this update. The invoice is committed before printing by design. The printer phase will add 58mm (2-inch), 80mm (3-inch), and A4 adapters without risking bill loss.
