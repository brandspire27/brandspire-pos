# Brandspire POS — Phase 6

## What this update adds

### Owner Dues & Payments
- New **Dues & Payments** navigation item.
- Lists invoices with outstanding amounts.
- Owner can record Cash / UPI / Card / Other later payments.
- Supports partial payments.
- Updates invoice paid/due status and customer outstanding amount transactionally.
- Every collection creates a payment record and audit log.

### Safe Invoice Cancellation
- Owner-only cancellation for invoices with **no captured payment**.
- Cancellation reason is mandatory.
- Sold stock is restored transactionally.
- Customer unpaid due is removed.
- Audit log + RETURN inventory movements are created.
- Paid / partially-paid invoices are intentionally blocked from cancellation until the refund/credit-note phase.
- Staff cannot cancel invoices.

### Invoice Payment History
- Invoice screen shows captured payments.
- Owner can jump to Dues & Payments when money is pending.
- Cancelled invoices are clearly marked on screen and print output.

### GST Report
- Reports now include taxable sales, CGST, SGST, IGST and total GST.
- GST-rate breakdown is included.
- Cancelled/refunded invoices are excluded.

### Android Native Foundation
- Android Studio project shell under `apps/android`.
- 58mm and 80mm paper profiles.
- ESC/POS encoder foundation.
- Real Android Bluetooth Classic SPP connection adapter.
- Real Android USB Host bulk-transfer adapter.
- Offline sync state + client invoice ID model.
- Hardware support is **not claimed production-ready until tested on the exact printers/devices**.

## Install

1. Copy this update over your existing `brandspire-pos-starter` folder and replace matching files.
2. In Supabase SQL Editor run:
   `supabase/migrations/0006_due_payments_cancellation_gst.sql`
3. Restart:
   `npx pnpm@11.24.0 dev`

No new npm/pnpm dependency is required for the web app in Phase 6.

## Test order

1. Create a CREDIT or partially-paid invoice.
2. Owner → **Dues & Payments** → record a partial payment.
3. Reopen invoice → payment history and updated due should appear.
4. Create a separate unpaid invoice → cancel it as Owner → verify stock is restored.
5. Reports → verify GST Summary.
6. Login as Staff → confirm there is no Owner Dues/Cancel capability.

## Known boundary

Refunds / credit notes for invoices that already received payment are deliberately not faked in this phase. That flow needs separate financial records and will be implemented next.
