# Brandspire POS Phase 6 Security / Business Tests

Run these against a development or staging Supabase project.

1. **Owner can collect a partial payment**
   - Create a CREDIT invoice with due amount.
   - Owner records a payment smaller than due.
   - Expect `PARTIALLY_PAID`, payment row created, customer outstanding reduced by exactly the payment.

2. **Owner can close a due invoice**
   - Record the remaining amount.
   - Expect invoice `PAID`, `amount_due = 0`, customer outstanding reduced.

3. **Staff cannot collect later payments**
   - Call `collect_invoice_payment` as Staff.
   - Expect `Owner access required`.

4. **Overpayment is rejected**
   - Attempt payment greater than `amount_due`.
   - Expect rejection and no payment row.

5. **Unpaid invoice cancellation restores stock**
   - Create an unpaid invoice.
   - Record product stock after sale.
   - Cancel as Owner with a reason.
   - Expect invoice `CANCELLED`, due removed, product stock restored, `RETURN` inventory movement created, audit log created.

6. **Staff cannot cancel invoices**
   - Call `cancel_pos_invoice` as Staff.
   - Expect `Owner access required`.

7. **Paid / partially-paid invoice cancellation is rejected**
   - Expect message requiring refund/credit-note workflow.
   - This prevents silently losing real payment history.

8. **Repeated cancellation does not restore stock twice**
   - Cancel an unpaid invoice.
   - Call cancellation again.
   - Expect same cancelled invoice response and no additional stock movement.

9. **GST report excludes cancelled/refunded invoices**
   - Compare GST summary before and after cancelling an unpaid invoice.
   - Cancelled invoice values must not appear in taxable/CGST/SGST/IGST totals.

10. **Tenant isolation**
   - Owner A must not collect/cancel an invoice belonging to Organization B.
   - Expect `Invoice not found` or tenant authorization failure.
