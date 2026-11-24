CREATE VIEW pos_sales_events AS
SELECT organization_id, id AS invoice_id, created_by, invoice_date AS event_date,
  grand_total AS gross, taxable_amount AS taxable, cgst, sgst, igst, 1 AS bill_count
FROM invoices WHERE status != 'CANCELLED'
UNION ALL
SELECT organization_id, invoice_id, created_by, created_at,
  -total_amount, -taxable_amount, -cgst, -sgst, -igst, 0
FROM credit_notes WHERE status = 'ISSUED';

CREATE VIEW pos_sales_line_events AS
SELECT ii.organization_id, ii.invoice_id, i.invoice_date AS event_date,
  ii.product_id, ii.product_name_snapshot AS name, ii.tax_rate AS rate,
  ii.quantity, ii.line_total AS gross, ii.taxable_amount AS taxable, ii.cgst, ii.sgst, ii.igst
FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id AND i.organization_id = ii.organization_id
WHERE i.status != 'CANCELLED'
UNION ALL
SELECT cni.organization_id, cn.invoice_id, cn.created_at,
  cni.product_id, cni.product_name_snapshot, ii.tax_rate,
  -cni.quantity, -cni.line_total, -cni.taxable_amount, -cni.cgst, -cni.sgst, -cni.igst
FROM credit_note_items cni
JOIN credit_notes cn ON cn.id = cni.credit_note_id AND cn.organization_id = cni.organization_id
JOIN invoice_items ii ON ii.id = cni.invoice_item_id AND ii.organization_id = cni.organization_id
WHERE cn.status = 'ISSUED';
