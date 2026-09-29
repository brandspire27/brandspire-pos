import { jsPDF } from 'jspdf';

export type PdfInvoice = {
  invoice_number: string;
  payment_status: string;
  payment_method: string | null;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  created_at: string;
};

export type PdfItem = {
  product_name_snapshot: string;
  hsn_sac_snapshot: string | null;
  unit_snapshot: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
};

export type PdfParty = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state?: string | null;
  gstin?: string | null;
};

function money(value: number | string | null | undefined) {
  return `INR ${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cleanFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-');
}

function invoiceDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function buildA4InvoicePdf(input: {
  invoice: PdfInvoice;
  items: PdfItem[];
  business: PdfParty;
  customer: PdfParty | null;
  footer?: string;
}) {
  const { invoice, items, business, customer, footer } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const left = 15;
  const right = 195;
  const width = right - left;
  let y = 17;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(business.name || 'Business', left, y);
  doc.setFontSize(12);
  doc.text('TAX INVOICE', right, y, { align: 'right' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const businessLines = [business.address, business.phone, business.email, business.gstin ? `GSTIN: ${business.gstin}` : null].filter(Boolean) as string[];
  businessLines.forEach((line) => { doc.text(line, left, y); y += 4; });

  const metaY = 23;
  doc.text(`Invoice: ${invoice.invoice_number}`, right, metaY, { align: 'right' });
  doc.text(invoiceDate(invoice.created_at), right, metaY + 4, { align: 'right' });
  doc.text(`${invoice.payment_method ?? '—'} / ${invoice.payment_status.replaceAll('_', ' ')}`, right, metaY + 8, { align: 'right' });

  y = Math.max(y + 2, 44);
  doc.setDrawColor(215);
  doc.line(left, y, right, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BILL TO', left, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 5;
  doc.text(customer?.name || 'Walk-in Customer', left, y);
  const customerLines = [customer?.address, customer?.state, customer?.phone, customer?.email, customer?.gstin ? `GSTIN: ${customer.gstin}` : null].filter(Boolean) as string[];
  customerLines.forEach((line) => { y += 4; doc.text(line, left, y); });
  y += 8;

  const columns = [left, 104, 124, 147, 166, right];
  const drawHeader = () => {
    doc.setFillColor(245, 247, 250);
    doc.rect(left, y - 4, width, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Item', columns[0] + 2, y + 1);
    doc.text('Qty', columns[1], y + 1);
    doc.text('Rate', columns[2], y + 1);
    doc.text('GST', columns[3], y + 1);
    doc.text('Amount', right - 2, y + 1, { align: 'right' });
    y += 7;
    doc.setFont('helvetica', 'normal');
  };

  drawHeader();
  for (const item of items) {
    const itemText = item.hsn_sac_snapshot ? `${item.product_name_snapshot}\nHSN/SAC ${item.hsn_sac_snapshot}` : item.product_name_snapshot;
    const lines = doc.splitTextToSize(itemText, 83) as string[];
    const rowHeight = Math.max(8, lines.length * 4 + 2);
    if (y + rowHeight > 270) {
      doc.addPage();
      y = 18;
      drawHeader();
    }
    doc.setFontSize(8.5);
    doc.text(lines, columns[0] + 2, y);
    doc.text(`${Number(item.quantity)} ${item.unit_snapshot}`, columns[1], y);
    doc.text(money(item.unit_price).replace('INR ', ''), columns[2], y);
    doc.text(`${Number(item.tax_rate)}%`, columns[3], y);
    doc.text(money(item.line_total).replace('INR ', ''), right - 2, y, { align: 'right' });
    y += rowHeight;
    doc.setDrawColor(238);
    doc.line(left, y - 2, right, y - 2);
  }

  if (y > 230) {
    doc.addPage();
    y = 20;
  } else {
    y += 4;
  }

  const labelX = 130;
  const valueX = right;
  const totalLine = (label: string, value: number, strong = false) => {
    doc.setFont('helvetica', strong ? 'bold' : 'normal');
    doc.setFontSize(strong ? 10.5 : 8.5);
    doc.text(label, labelX, y);
    doc.text(money(value), valueX, y, { align: 'right' });
    y += strong ? 6 : 5;
  };

  totalLine('Subtotal', invoice.subtotal);
  if (Number(invoice.discount_amount) > 0) totalLine('Discount', -Number(invoice.discount_amount));
  totalLine('Taxable', invoice.taxable_amount);
  if (Number(invoice.cgst) > 0) totalLine('CGST', invoice.cgst);
  if (Number(invoice.sgst) > 0) totalLine('SGST', invoice.sgst);
  if (Number(invoice.igst) > 0) totalLine('IGST', invoice.igst);
  totalLine('Grand Total', invoice.grand_total, true);
  totalLine('Paid', invoice.amount_paid);
  if (Number(invoice.amount_due) > 0) totalLine('Due', invoice.amount_due, true);

  const footerY = 285;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text(footer || 'Thank you for your business.', left, footerY);
  doc.text('Generated with Brandspire POS · A Brandspire Product', right, footerY, { align: 'right' });

  const filename = `${cleanFilename(invoice.invoice_number || 'brandspire-invoice')}.pdf`;
  return { doc, filename };
}

export function downloadA4InvoicePdf(input: Parameters<typeof buildA4InvoicePdf>[0]) {
  const { doc, filename } = buildA4InvoicePdf(input);
  doc.save(filename);
}

export async function shareA4InvoicePdf(input: Parameters<typeof buildA4InvoicePdf>[0]) {
  const { doc, filename } = buildA4InvoicePdf(input);
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  const shareData = {
    title: `Invoice ${input.invoice.invoice_number}`,
    text: `Invoice ${input.invoice.invoice_number} · ${money(input.invoice.grand_total)}`,
    files: [file]
  };

  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    await navigator.share(shareData);
    return true;
  }
  return false;
}
