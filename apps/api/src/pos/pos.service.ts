import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TursoService } from '../database/turso.service';

const optionalText = z.string().trim().max(500).optional().nullable();
const customerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal('')),
  address: optionalText, state: z.string().trim().max(100).optional().nullable(),
  gstin: z.string().trim().max(15).optional().nullable(), notes: optionalText
});
const productInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(100).optional().nullable(),
  barcode: z.string().trim().max(100).optional().nullable(),
  unit: z.string().trim().min(1).max(30).default('pcs'),
  hsn_sac: z.string().trim().max(30).optional().nullable(),
  purchase_price: z.number().min(0).default(0),
  selling_price: z.number().min(0),
  tax_rate: z.number().min(0).max(100).default(0),
  tax_inclusive: z.boolean().default(false),
  stock: z.number().default(0),
  low_stock_threshold: z.number().min(0).default(5)
});
const invoiceInput = z.object({
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() })).min(1).max(500),
  discountType: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
  discountValue: z.number().min(0).default(0),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'OTHER']).default('CASH'),
  amountPaid: z.number().min(0).nullable().optional(),
  clientInvoiceId: z.string().uuid().optional()
});

type DbRecord = Record<string, unknown>;
const asArray = (value: unknown) => (Array.isArray(value) ? value as unknown[] : []);

@Injectable()
export class PosService {
  constructor(private readonly database: TursoService) {}

  private async settings(organizationId: string) {
    const result = await this.database.execute(`SELECT * FROM organization_settings WHERE organization_id = ? LIMIT 1`, [organizationId]);
    return (result.rows[0] as unknown as DbRecord | undefined) ?? {
      invoice_prefix: 'BSP', negative_stock_enabled: 0, allow_staff_discount: 0, staff_discount_limit: 0,
      default_payment_method: 'CASH'
    };
  }

  async customer(organizationId: string, customerId: string) {
    const result = await this.database.execute(
      `SELECT id, name, phone, email, address, state, gstin, notes, outstanding_balance, active, created_at
       FROM customers WHERE id = ? AND organization_id = ? AND deleted_at IS NULL LIMIT 1`,
      [customerId, organizationId]
    );
    if (!result.rows.length) throw new NotFoundException('Customer not found');
    return result.rows[0];
  }

  async workspace(userId: string, organizationId: string) {
    const result = await this.database.execute(
      `SELECT o.id AS organizationId, o.name AS organizationName, m.role,
        o.preferred_language AS preferredLanguage, s.status AS subscriptionStatus,
        s.ends_at AS endsAt, s.admin_message AS adminMessage
       FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id AND m.user_id = ? AND m.active = 1
       LEFT JOIN subscriptions s ON s.id = (
         SELECT id FROM subscriptions WHERE organization_id = o.id ORDER BY created_at DESC LIMIT 1
       )
       WHERE o.id = ? LIMIT 1`,
      [userId, organizationId]
    );
    const row = result.rows[0] as unknown as DbRecord | undefined;
    if (!row) throw new NotFoundException('Active Brandspire POS workspace not found');
    return row;
  }

  async organizationSettings(organizationId: string) {
    const result = await this.database.execute(
      `SELECT o.name, o.phone, o.email, o.gstin, o.address, o.city, o.state, o.pincode, o.preferred_language,
        s.invoice_prefix, s.default_print_format, s.default_payment_method, s.negative_stock_enabled,
        s.allow_staff_discount, s.staff_discount_limit, s.receipt_header, s.receipt_footer, s.invoice_footer,
        s.show_gstin_on_receipt, s.print_copies
       FROM organizations o JOIN organization_settings s ON s.organization_id = o.id WHERE o.id = ? LIMIT 1`,
      [organizationId]
    );
    const row = result.rows[0] as unknown as DbRecord | undefined;
    if (!row) throw new NotFoundException('Organization settings not found');
    for (const key of ['negative_stock_enabled', 'allow_staff_discount', 'show_gstin_on_receipt']) {
      row[key] = Number(row[key]) === 1;
    }
    return row;
  }

  async updateOrganizationSettings(organizationId: string, input: unknown) {
    const schema = z.object({
      name: z.string().trim().min(1).max(160), phone: optionalText, email: z.string().trim().email().max(200).optional().nullable().or(z.literal('')),
      gstin: z.string().trim().max(15).optional().nullable(), address: optionalText, city: z.string().trim().max(100).optional().nullable(),
      state: z.string().trim().max(100).optional().nullable(), pincode: z.string().trim().max(20).optional().nullable(),
      preferred_language: z.enum(['en', 'hi', 'hinglish']),
      invoice_prefix: z.string().trim().min(1).max(20), default_print_format: z.enum(['THERMAL_58MM', 'THERMAL_80MM', 'A4']),
      default_payment_method: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'OTHER']), negative_stock_enabled: z.boolean(),
      allow_staff_discount: z.boolean(), staff_discount_limit: z.number().min(0).max(100), receipt_header: optionalText,
      receipt_footer: optionalText, invoice_footer: optionalText, show_gstin_on_receipt: z.boolean(), print_copies: z.number().int().min(1).max(5)
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid organization settings');
    const value = parsed.data;
    await this.database.transaction(async (tx) => {
        await tx.execute({
        sql: `UPDATE organizations SET name = ?, phone = ?, email = ?, gstin = ?, address = ?, city = ?, state = ?,
          pincode = ?, preferred_language = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        args: [value.name, value.phone || null, value.email || null, value.gstin?.toUpperCase() || null, value.address || null,
          value.city || null, value.state || null, value.pincode || null, value.preferred_language, organizationId]
      });
      await tx.execute({
        sql: `UPDATE organization_settings SET invoice_prefix = ?, default_print_format = ?, default_payment_method = ?,
          negative_stock_enabled = ?, allow_staff_discount = ?, staff_discount_limit = ?, receipt_header = ?, receipt_footer = ?,
          invoice_footer = ?, show_gstin_on_receipt = ?, print_copies = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE organization_id = ?`,
        args: [value.invoice_prefix.toUpperCase(), value.default_print_format, value.default_payment_method,
          Number(value.negative_stock_enabled), Number(value.allow_staff_discount), value.staff_discount_limit,
          value.receipt_header || null, value.receipt_footer || null, value.invoice_footer || null,
          Number(value.show_gstin_on_receipt), value.print_copies, organizationId]
      });
    });
    return this.organizationSettings(organizationId);
  }

  async listProducts(organizationId: string, input: { query?: string; activeOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 500), 1), 2000);
    const query = input.query?.trim() ?? '';
    const result = await this.database.execute(
      `SELECT id, name, sku, barcode, unit, hsn_sac, purchase_price, selling_price, tax_rate, tax_inclusive,
        stock, low_stock_threshold, image_key, active, created_at
       FROM products WHERE organization_id = ? AND deleted_at IS NULL
       AND (? = 0 OR active = 1)
       AND (? = '' OR name LIKE ? OR sku LIKE ? OR barcode = ?)
       ORDER BY name LIMIT ?`,
      [organizationId, input.activeOnly ? 1 : 0, query, `%${query}%`, `%${query}%`, query, limit]
    );
    return result.rows.map((row) => ({ ...(row as DbRecord), tax_inclusive: Number((row as DbRecord).tax_inclusive) === 1, active: Number((row as DbRecord).active) === 1 }));
  }

  async assistExactProducts(organizationId: string, term: string) {
    const result = await this.database.execute(
      `SELECT id FROM products WHERE organization_id = ? AND deleted_at IS NULL AND active = 1
       AND (lower(trim(name)) = lower(?) OR lower(sku) = lower(?) OR barcode = ?) LIMIT 2`,
      [organizationId, term, term, term]
    );
    return Promise.all(result.rows.map(row => this.product(organizationId, String(row.id))));
  }

  async product(organizationId: string, productId: string) {
    const result = await this.database.execute(
      `SELECT id, name, sku, barcode, unit, hsn_sac, purchase_price, selling_price, tax_rate, tax_inclusive,
        stock, low_stock_threshold, image_key, active, created_at
       FROM products WHERE id = ? AND organization_id = ? AND deleted_at IS NULL LIMIT 1`,
      [productId, organizationId]
    );
    if (!result.rows.length) throw new NotFoundException('Product not found');
    return result.rows[0];
  }

  async listCustomers(organizationId: string, input: { query?: string; activeOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 500), 1), 2000);
    const query = input.query?.trim() ?? '';
    const result = await this.database.execute(
      `SELECT id, name, phone, email, address, state, gstin, notes, outstanding_balance, active, created_at
       FROM customers WHERE organization_id = ? AND deleted_at IS NULL
       AND (? = 0 OR active = 1) AND (? = '' OR name LIKE ? OR phone LIKE ? OR email LIKE ? OR gstin LIKE ?)
       ORDER BY name LIMIT ?`,
      [organizationId, input.activeOnly ? 1 : 0, query, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit]
    );
    return result.rows.map((row) => ({ ...(row as DbRecord), active: Number((row as DbRecord).active) === 1 }));
  }

  async createCustomer(organizationId: string, userId: string, input: unknown, id?: string) {
    const parsed = customerInput.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid customer details');
    const value = parsed.data;
    const customerId = value.id ?? id ?? randomUUID();
    await this.database.execute(
      `INSERT INTO customers(id, organization_id, name, phone, email, address, state, gstin, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, organizationId, value.name, value.phone || null, value.email || null, value.address || null,
        value.state || null, value.gstin?.toUpperCase() || null, value.notes || null, userId]
    );
    return customerId;
  }

  async deleteCustomer(organizationId: string, customerId: string) {
    const result = await this.database.execute(
      `UPDATE customers SET active = 0, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
      [customerId, organizationId]
    );
    if (!result.rowsAffected) throw new NotFoundException('Customer not found');
  }

  async createProduct(organizationId: string, userId: string, input: unknown, id?: string) {
    const parsed = productInput.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid product details');
    const value = parsed.data;
    const productId = value.id ?? id ?? randomUUID();
    await this.database.transaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO products(id, organization_id, name, sku, barcode, unit, hsn_sac, purchase_price, selling_price,
          tax_rate, tax_inclusive, stock, low_stock_threshold, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [productId, organizationId, value.name, value.sku || null, value.barcode || null, value.unit, value.hsn_sac || null,
          value.purchase_price, value.selling_price, value.tax_rate, value.tax_inclusive ? 1 : 0, value.stock,
          value.low_stock_threshold, userId]
      });
      if (value.stock !== 0) {
        await tx.execute({
          sql: `INSERT INTO inventory_movements(id, organization_id, product_id, movement_type, quantity_change, stock_after, actor_user_id, note)
                VALUES (?, ?, ?, 'OPENING', ?, ?, ?, 'Opening stock')`,
          args: [randomUUID(), organizationId, productId, value.stock, value.stock, userId]
        });
      }
    });
    return productId;
  }

  async deleteProduct(organizationId: string, productId: string) {
    const result = await this.database.execute(
      `UPDATE products SET active = 0, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
      [productId, organizationId]
    );
    if (!result.rowsAffected) throw new NotFoundException('Product not found');
  }

  async billingPolicy(organizationId: string) {
    const settings = await this.settings(organizationId);
    return {
      allowStaffDiscount: Number(settings.allow_staff_discount) === 1,
      staffDiscountLimit: Number(settings.staff_discount_limit ?? 0),
      defaultPayment: String(settings.default_payment_method ?? 'CASH')
    };
  }

  async listInvoices(organizationId: string, input: { dueOnly?: boolean; query?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 200), 1), 1000);
    const search = input.query?.trim() ?? '';
    const result = await this.database.execute(
      `SELECT i.id, i.invoice_number, i.customer_id, i.status, i.payment_status, i.payment_method,
        i.subtotal, i.discount_amount, i.taxable_amount, i.cgst, i.sgst, i.igst, i.grand_total,
        i.amount_paid, i.amount_due, i.invoice_date, i.created_at, c.name AS customer_name,
        c.phone AS customer_phone
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
       WHERE i.organization_id = ? AND (? = 0 OR (i.amount_due > 0 AND i.status NOT IN ('CANCELLED','REFUNDED')))
       AND (? = '' OR i.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)
       ORDER BY i.invoice_date DESC LIMIT ?`,
      [organizationId, input.dueOnly ? 1 : 0, search, `%${search}%`, `%${search}%`, `%${search}%`, limit]
    );
    return result.rows;
  }

  async createInvoice(organizationId: string, userId: string, role: 'OWNER' | 'STAFF', input: unknown) {
    const parsed = invoiceInput.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid bill');
    const value = parsed.data;
    const clientId = value.clientInvoiceId ?? randomUUID();
    const existing = await this.database.execute(
      `SELECT id, invoice_number, grand_total FROM invoices WHERE organization_id = ? AND client_invoice_id = ? LIMIT 1`,
      [organizationId, clientId]
    );
    if (existing.rows.length) {
      const row = existing.rows[0] as unknown as { id: string; invoice_number: string; grand_total: number };
      return { invoice_id: row.id, invoice_number: row.invoice_number, grand_total: row.grand_total };
    }
    if (value.customerId) {
      const customer = await this.database.execute(
        `SELECT id FROM customers WHERE id = ? AND organization_id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
        [value.customerId, organizationId]
      );
      if (!customer.rows.length) throw new BadRequestException('The selected customer is not available in this business');
    }
    const settings = await this.settings(organizationId);
    if (role === 'STAFF' && value.discountValue > 0 &&
        (Number(settings.allow_staff_discount) !== 1 || value.discountType !== 'PERCENT' || value.discountValue > Number(settings.staff_discount_limit))) {
      throw new BadRequestException('The requested discount exceeds the owner billing policy');
    }
    const productsById = new Map<string, DbRecord>();
    for (const item of value.items) {
      const product = await this.database.execute(
        `SELECT id, name, sku, hsn_sac, unit, selling_price, tax_rate, tax_inclusive, stock
         FROM products WHERE id = ? AND organization_id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
        [item.productId, organizationId]
      );
      if (!product.rows.length) throw new BadRequestException('A product in this bill is no longer available');
      productsById.set(item.productId, product.rows[0] as unknown as DbRecord);
    }
    const lines = value.items.map((item) => {
      const product = productsById.get(item.productId)!;
      const gross = Number(product.selling_price) * item.quantity;
      const rate = Number(product.tax_rate) / 100;
      const taxable = Number(product.tax_inclusive) === 1 && rate > 0 ? gross / (1 + rate) : gross;
      const tax = Number(product.tax_inclusive) === 1 ? gross - taxable : taxable * rate;
      return { item, product, gross, taxable, tax };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.taxable, 0);
    const discountAmount = value.discountType === 'PERCENT'
      ? subtotal * Math.min(value.discountValue, 100) / 100
      : Math.min(value.discountValue, subtotal);
    const afterDiscount = Math.max(subtotal - discountAmount, 0);
    const taxFactor = subtotal > 0 ? afterDiscount / subtotal : 1;
    const taxableAmount = afterDiscount;
    const taxAmount = lines.reduce((sum, line) => sum + line.tax, 0) * taxFactor;
    const orgInfo = await this.database.execute(`SELECT state FROM organizations WHERE id = ?`, [organizationId]);
    const orgState = String((orgInfo.rows[0] as { state?: string } | undefined)?.state ?? '').toLowerCase();
    const customerInfo = value.customerId
      ? await this.database.execute(`SELECT state FROM customers WHERE id = ? AND organization_id = ?`, [value.customerId, organizationId])
      : { rows: [] };
    const customerState = String((customerInfo.rows[0] as { state?: string } | undefined)?.state ?? orgState).toLowerCase();
    const interstate = !!orgState && !!customerState && orgState !== customerState;
    const cgst = interstate ? 0 : taxAmount / 2;
    const sgst = interstate ? 0 : taxAmount / 2;
    const igst = interstate ? taxAmount : 0;
    const grandTotal = Math.max(0, Math.round((taxableAmount + taxAmount) * 100) / 100);
    const requestedPaid = value.amountPaid ?? (value.paymentMethod === 'CREDIT' ? 0 : grandTotal);
    if (requestedPaid > grandTotal) throw new BadRequestException('Amount paid cannot exceed the bill total');
    const amountPaid = Math.round(requestedPaid * 100) / 100;
    const amountDue = Math.round((grandTotal - amountPaid) * 100) / 100;
    const invoiceId = randomUUID();
    const invoiceDate = new Date().toISOString();
    const year = new Date().getUTCFullYear();
    const numberResult = await this.database.execute(
      `INSERT INTO invoice_counters(organization_id, invoice_year, next_number) VALUES (?, ?, 2)
       ON CONFLICT(organization_id, invoice_year) DO UPDATE SET next_number = invoice_counters.next_number + 1
       RETURNING next_number - 1 AS invoice_number`,
      [organizationId, year]
    );
    const invoiceNumber = `${String(settings.invoice_prefix ?? 'BSP')}-${year}-${String(Number((numberResult.rows[0] as { invoice_number?: number } | undefined)?.invoice_number ?? 1)).padStart(5, '0')}`;
    try {
      await this.database.transaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO invoices(id, organization_id, customer_id, invoice_number, client_invoice_id, created_by, created_by_role,
          status, payment_status, payment_method, subtotal, discount_type, discount_value, discount_amount, taxable_amount,
          cgst, sgst, igst, grand_total, amount_paid, amount_due, invoice_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [invoiceId, organizationId, value.customerId ?? null, invoiceNumber, clientId, userId, role,
          amountDue === 0 ? 'PAID' : amountPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING',
          amountDue === 0 ? 'PAID' : amountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
          value.paymentMethod, subtotal, value.discountType, value.discountValue, discountAmount, taxableAmount,
          cgst, sgst, igst, grandTotal, amountPaid, amountDue, invoiceDate]
        });
        for (const line of lines) {
          const tax = line.tax * taxFactor;
          const lineTaxable = line.taxable * taxFactor;
          const stockResult = await tx.execute({
            sql: `UPDATE products SET stock = stock - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                  WHERE id = ? AND organization_id = ? AND active = 1 AND deleted_at IS NULL
                    AND (? = 1 OR stock >= ?)
                  RETURNING stock`,
            args: [line.item.quantity, line.item.productId, organizationId, Number(settings.negative_stock_enabled), line.item.quantity]
          });
          const stockAfter = Number((stockResult.rows[0] as { stock?: number } | undefined)?.stock);
          if (stockResult.rows.length === 0) {
            throw new BadRequestException(`Insufficient stock for ${String(line.product.name)}`);
          }
          await tx.execute({
            sql: `INSERT INTO invoice_items(id, organization_id, invoice_id, product_id, product_name_snapshot, sku_snapshot,
              hsn_sac_snapshot, unit_snapshot, quantity, unit_price, tax_rate, tax_inclusive, taxable_amount, cgst, sgst, igst, line_total)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [randomUUID(), organizationId, invoiceId, line.item.productId, String(line.product.name), line.product.sku == null ? null : String(line.product.sku),
              line.product.hsn_sac == null ? null : String(line.product.hsn_sac), String(line.product.unit ?? 'pcs'), line.item.quantity,
              Number(line.product.selling_price), Number(line.product.tax_rate), Number(line.product.tax_inclusive) ? 1 : 0,
              lineTaxable, interstate ? 0 : tax / 2, interstate ? 0 : tax / 2, interstate ? tax : 0, lineTaxable + tax]
          });
          await tx.execute({
            sql: `INSERT INTO inventory_movements(id, organization_id, product_id, invoice_id, movement_type, quantity_change, stock_after, actor_user_id, note)
                  VALUES (?, ?, ?, ?, 'SALE', ?, ?, ?, ?)`,
            args: [randomUUID(), organizationId, line.item.productId, invoiceId, -line.item.quantity, stockAfter, userId, invoiceNumber]
          });
        }
        if (amountPaid > 0) {
          await tx.execute({
            sql: `INSERT INTO payments(id, organization_id, invoice_id, amount, method, status, created_by)
                  VALUES (?, ?, ?, ?, ?, 'CAPTURED', ?)`,
            args: [randomUUID(), organizationId, invoiceId, amountPaid, value.paymentMethod, userId]
          });
        }
        if (value.customerId && amountDue > 0) {
          await tx.execute({
            sql: `UPDATE customers SET outstanding_balance = outstanding_balance + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`,
            args: [amountDue, value.customerId, organizationId]
          });
        }
      });
    } catch (error) {
      const duplicate = await this.database.execute(
        `SELECT id, invoice_number, grand_total FROM invoices WHERE organization_id = ? AND client_invoice_id = ? LIMIT 1`,
        [organizationId, clientId]
      );
      const row = duplicate.rows[0] as unknown as { id: string; invoice_number: string; grand_total: number } | undefined;
      if (row) return { invoice_id: row.id, invoice_number: row.invoice_number, grand_total: row.grand_total };
      throw error;
    }
    return { invoice_id: invoiceId, invoice_number: invoiceNumber, grand_total: grandTotal };
  }

  async invoiceDetail(organizationId: string, invoiceId: string) {
    const [invoice, items, payments, organization, settings] = await Promise.all([
      this.database.execute(
        `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address, c.state AS customer_state, c.gstin AS customer_gstin
         FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
         WHERE i.id = ? AND i.organization_id = ? LIMIT 1`,
        [invoiceId, organizationId]
      ),
      this.database.execute(`SELECT id, product_name_snapshot, hsn_sac_snapshot, unit_snapshot, quantity, unit_price, tax_rate, taxable_amount, cgst, sgst, igst, line_total FROM invoice_items WHERE invoice_id = ? AND organization_id = ? ORDER BY created_at`, [invoiceId, organizationId]),
      this.database.execute(`SELECT id, amount, method, status, note, created_at FROM payments WHERE invoice_id = ? AND organization_id = ? ORDER BY created_at DESC`, [invoiceId, organizationId]),
      this.database.execute(`SELECT name, phone, email, address, state, gstin FROM organizations WHERE id = ?`, [organizationId]),
      this.database.execute(`SELECT default_print_format, receipt_header, receipt_footer, invoice_footer, show_gstin_on_receipt FROM organization_settings WHERE organization_id = ?`, [organizationId])
    ]);
    if (!invoice.rows.length) throw new NotFoundException('Invoice not found');
    return { invoice: invoice.rows[0], items: items.rows, payments: payments.rows, organization: organization.rows[0] ?? {}, settings: settings.rows[0] ?? {} };
  }

  async issuePayment(organizationId: string, userId: string, invoiceId: string, input: unknown) {
    const parsed = z.object({ amount: z.number().positive(), method: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'OTHER']), note: optionalText }).safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid payment');
    const invoiceResult = await this.database.execute(
      `SELECT customer_id, grand_total, amount_paid, amount_due, status FROM invoices
       WHERE id = ? AND organization_id = ? LIMIT 1`,
      [invoiceId, organizationId]
    );
    const invoice = invoiceResult.rows[0] as unknown as { customer_id:string|null; grand_total:number; amount_paid:number; amount_due:number; status:string } | undefined;
    if (!invoice || ['CANCELLED', 'REFUNDED'].includes(invoice.status)) throw new NotFoundException('Open invoice not found');
    const amount = Math.round(parsed.data.amount * 100) / 100;
    if (amount > Number(invoice.amount_due) + 0.001) throw new BadRequestException('Payment cannot exceed the outstanding amount');
    const newPaid = Number(invoice.amount_paid) + amount;
    const newDue = Math.max(0, Number(invoice.grand_total) - newPaid);
    await this.database.transaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO payments(id, organization_id, invoice_id, amount, method, status, note, created_by)
              VALUES (?, ?, ?, ?, ?, 'CAPTURED', ?, ?)`,
        args: [randomUUID(), organizationId, invoiceId, amount, parsed.data.method, parsed.data.note || null, userId]
      });
      await tx.execute({
        sql: `UPDATE invoices SET amount_paid = ?, amount_due = ?, payment_status = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`,
        args: [newPaid, newDue, newDue === 0 ? 'PAID' : 'PARTIALLY_PAID', newDue === 0 ? 'PAID' : 'PARTIALLY_PAID', invoiceId, organizationId]
      });
      if (invoice.customer_id) await tx.execute({
        sql: `UPDATE customers SET outstanding_balance = MAX(0, outstanding_balance - ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`,
        args: [amount, invoice.customer_id, organizationId]
      });
    });
    return { invoiceId, amountPaid: newPaid, amountDue: newDue };
  }

  async eligibleReturnInvoices(organizationId: string) {
    const result = await this.database.execute(
      `SELECT i.id, i.invoice_number, i.grand_total, i.credited_amount, i.created_at, i.customer_id, c.name AS customer_name
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
       WHERE i.organization_id = ? AND i.payment_status = 'PAID' AND i.amount_due = 0
       AND i.status NOT IN ('CANCELLED', 'REFUNDED') ORDER BY i.created_at DESC LIMIT 100`,
      [organizationId]
    );
    return result.rows;
  }

  async returnableInvoiceItems(organizationId: string, invoiceId: string) {
    const result = await this.database.execute(
      `SELECT ii.id, ii.product_name_snapshot, ii.quantity, ii.line_total, ii.product_id,
        COALESCE(SUM(cni.quantity), 0) AS returned_quantity
       FROM invoice_items ii LEFT JOIN credit_note_items cni ON cni.invoice_item_id = ii.id AND cni.organization_id = ii.organization_id
       LEFT JOIN credit_notes cn ON cn.id = cni.credit_note_id AND cn.organization_id = cni.organization_id AND cn.status = 'ISSUED'
       WHERE ii.organization_id = ? AND ii.invoice_id = ? GROUP BY ii.id ORDER BY ii.created_at`,
      [organizationId, invoiceId]
    );
    return result.rows;
  }

  async issueCreditNote(organizationId: string, userId: string, invoiceId: string, input: unknown) {
    const schema = z.object({
      reason: z.string().trim().min(3).max(500),
      refundMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']),
      items: z.array(z.object({ invoice_item_id: z.string().uuid(), quantity: z.number().positive() })).min(1).max(500)
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid return details');
    if (new Set(parsed.data.items.map((item) => item.invoice_item_id)).size !== parsed.data.items.length) {
      throw new BadRequestException('Return items must be unique');
    }
    const result = await this.database.execute(
      `SELECT id, customer_id, grand_total, credited_amount, status FROM invoices WHERE id = ? AND organization_id = ? LIMIT 1`,
      [invoiceId, organizationId]
    );
    const invoice = result.rows[0] as unknown as DbRecord | undefined;
    if (!invoice || invoice.status === 'CANCELLED' || invoice.status === 'REFUNDED') throw new NotFoundException('Eligible invoice not found');
    const noteId = randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    let noteNumber = '';
    let total = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
    await this.database.transaction(async (tx) => {
      const invoiceItems = await tx.execute({
        sql: `SELECT id, product_id, product_name_snapshot, quantity, unit_price, taxable_amount, cgst, sgst, igst, line_total
          FROM invoice_items WHERE organization_id = ? AND invoice_id = ?`,
        args: [organizationId, invoiceId]
      });
      const lineRows = invoiceItems.rows as unknown as Array<DbRecord>;
      const counter = await tx.execute({ sql: `SELECT next_number FROM credit_note_counters WHERE organization_id = ? AND note_year = ?`, args: [organizationId, year] });
      const number = counter.rows.length ? Number((counter.rows[0] as unknown as DbRecord).next_number) : 1;
      await tx.execute({
        sql: `INSERT INTO credit_note_counters(organization_id, note_year, next_number) VALUES (?, ?, ?)
          ON CONFLICT(organization_id, note_year) DO UPDATE SET next_number = excluded.next_number, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        args: [organizationId, year, number + 1]
      });
      noteNumber = `CN-${year}-${String(number).padStart(5, '0')}`;
      const selectedLines: Array<{ row: DbRecord; quantity: number; returned: number; lineTotal: number; lineTaxable: number; lineCgst: number; lineSgst: number; lineIgst: number }> = [];
      for (const requested of parsed.data.items) {
        const row = lineRows.find((line) => line.id === requested.invoice_item_id);
        if (!row) throw new BadRequestException('Return item does not belong to this invoice');
        const prior = await tx.execute({
          sql: `SELECT COALESCE(SUM(cni.quantity), 0) AS returned FROM credit_note_items cni
            JOIN credit_notes cn ON cn.id = cni.credit_note_id AND cn.organization_id = cni.organization_id AND cn.status = 'ISSUED'
            WHERE cni.organization_id = ? AND cni.invoice_item_id = ?`,
          args: [organizationId, requested.invoice_item_id]
        });
        const returned = Number((prior.rows[0] as unknown as DbRecord | undefined)?.returned ?? 0);
        const original = Number(row.quantity);
        if (requested.quantity + returned > original + 1e-9) throw new BadRequestException('Return quantity exceeds remaining quantity');
        const fraction = requested.quantity / original;
        const lineTotal = Number(row.line_total) * fraction;
        const lineTaxable = Number(row.taxable_amount) * fraction;
        const lineCgst = Number(row.cgst) * fraction, lineSgst = Number(row.sgst) * fraction, lineIgst = Number(row.igst) * fraction;
        selectedLines.push({ row, quantity: requested.quantity, returned, lineTotal, lineTaxable, lineCgst, lineSgst, lineIgst });
        total += lineTotal; taxable += lineTaxable; cgst += lineCgst; sgst += lineSgst; igst += lineIgst;
      }
      if (!(total > 0) || total + Number(invoice.credited_amount ?? 0) > Number(invoice.grand_total) + 0.01) throw new BadRequestException('Return amount exceeds remaining refundable total');
      await tx.execute({
        sql: `INSERT INTO credit_notes(id, organization_id, invoice_id, customer_id, credit_note_number, reason, refund_method, taxable_amount, cgst, sgst, igst, total_amount, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [noteId, organizationId, invoiceId, invoice.customer_id == null ? null : String(invoice.customer_id), noteNumber, parsed.data.reason, parsed.data.refundMethod, taxable, cgst, sgst, igst, total, userId]
      });
      for (const line of selectedLines) {
        const unitCredit = Number(line.row.line_total) / Number(line.row.quantity);
        await tx.execute({
          sql: `INSERT INTO credit_note_items(id, organization_id, credit_note_id, invoice_item_id, product_id, product_name_snapshot,
            quantity, unit_credit, taxable_amount, cgst, sgst, igst, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [randomUUID(), organizationId, noteId, String(line.row.id), line.row.product_id == null ? null : String(line.row.product_id), String(line.row.product_name_snapshot),
            line.quantity, unitCredit, line.lineTaxable, line.lineCgst, line.lineSgst, line.lineIgst, line.lineTotal]
        });
        if (line.row.product_id) {
          const productId = String(line.row.product_id);
          const stock = await tx.execute({ sql: `SELECT stock FROM products WHERE id = ? AND organization_id = ?`, args: [productId, organizationId] });
          if (stock.rows.length) {
            const stockAfter = Number((stock.rows[0] as unknown as DbRecord).stock) + line.quantity;
            await tx.execute({ sql: `UPDATE products SET stock = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`, args: [stockAfter, productId, organizationId] });
            await tx.execute({
              sql: `INSERT INTO inventory_movements(id, organization_id, product_id, invoice_id, movement_type, quantity_change, stock_after, actor_user_id, note)
                VALUES (?, ?, ?, ?, 'RETURN', ?, ?, ?, ?)`,
              args: [randomUUID(), organizationId, productId, invoiceId, line.quantity, stockAfter, userId, noteNumber]
            });
          }
        }
      }
      await tx.execute({
        sql: `INSERT INTO payments(id, organization_id, invoice_id, amount, method, status, payment_kind, note, created_by)
          VALUES (?, ?, ?, ?, ?, 'CAPTURED', 'REFUND', ?, ?)`,
        args: [randomUUID(), organizationId, invoiceId, total, parsed.data.refundMethod, noteNumber, userId]
      });
      const creditedTotal = Number(invoice.credited_amount ?? 0) + total;
      await tx.execute({
        sql: `UPDATE invoices SET credited_amount = ?, status = CASE WHEN ? >= grand_total - 0.01 THEN 'REFUNDED' ELSE status END,
          payment_status = CASE WHEN ? >= grand_total - 0.01 THEN 'REFUNDED' ELSE payment_status END,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`,
        args: [creditedTotal, creditedTotal, creditedTotal, invoiceId, organizationId]
      });
    });
    return { credit_note_number: noteNumber, total_amount: total };
  }

  async cancelInvoice(organizationId: string, userId: string, invoiceId: string, input: unknown) {
    const parsed = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'A cancellation reason is required');
    const invoiceResult = await this.database.execute(
      `SELECT customer_id, amount_due, amount_paid, status FROM invoices WHERE id = ? AND organization_id = ? LIMIT 1`,
      [invoiceId, organizationId]
    );
    const invoice = invoiceResult.rows[0] as unknown as { customer_id:string|null; amount_due:number; amount_paid:number; status:string } | undefined;
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Invoice is already cancelled');
    if (Number(invoice.amount_paid) > 0) throw new BadRequestException('Invoices with payments must be refunded before cancellation');
    const lines = await this.database.execute(
      `SELECT product_id, quantity FROM invoice_items WHERE organization_id = ? AND invoice_id = ? AND product_id IS NOT NULL`,
      [organizationId, invoiceId]
    );
    await this.database.transaction(async (tx) => {
      for (const row of lines.rows as unknown as Array<{ product_id:string; quantity:number }>) {
        const current = await tx.execute({
          sql: `SELECT stock FROM products WHERE id = ? AND organization_id = ?`,
          args: [row.product_id, organizationId]
        });
        if (!current.rows.length) continue;
        const stockAfter = Number((current.rows[0] as unknown as { stock:number }).stock) + Number(row.quantity);
        await tx.execute({ sql: `UPDATE products SET stock = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`, args: [stockAfter, row.product_id, organizationId] });
        await tx.execute({
          sql: `INSERT INTO inventory_movements(id, organization_id, product_id, invoice_id, movement_type, quantity_change, stock_after, actor_user_id, note)
                VALUES (?, ?, ?, ?, 'RETURN', ?, ?, ?, ?)`,
          args: [randomUUID(), organizationId, row.product_id, invoiceId, row.quantity, stockAfter, userId, parsed.data.reason]
        });
      }
      await tx.execute({
        sql: `UPDATE invoices SET status = 'CANCELLED', payment_status = 'UNPAID', cancellation_reason = ?,
          cancelled_by = ?, cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`,
        args: [parsed.data.reason, userId, invoiceId, organizationId]
      });
      if (invoice.customer_id && Number(invoice.amount_due) > 0) await tx.execute({
        sql: `UPDATE customers SET outstanding_balance = MAX(0, outstanding_balance - ?),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`,
        args: [invoice.amount_due, invoice.customer_id, organizationId]
      });
    });
    return { cancelled: true };
  }

  async adjustStock(organizationId: string, userId: string, productId: string, input: unknown) {
    const parsed = z.object({ quantityChange: z.number().refine((value) => value !== 0), note: optionalText }).safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid stock adjustment');
    const rowResult = await this.database.execute(
      `SELECT stock FROM products WHERE id = ? AND organization_id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
      [productId, organizationId]
    );
    if (!rowResult.rows.length) throw new NotFoundException('Product not found');
    const stock = Number((rowResult.rows[0] as unknown as { stock:number }).stock);
    const after = stock + parsed.data.quantityChange;
    if (after < 0) throw new BadRequestException('Stock adjustment cannot make stock negative');
    await this.database.transaction(async (tx) => {
      await tx.execute({ sql: `UPDATE products SET stock = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND organization_id = ?`, args: [after, productId, organizationId] });
      await tx.execute({
        sql: `INSERT INTO inventory_movements(id, organization_id, product_id, movement_type, quantity_change, stock_after, actor_user_id, note)
              VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, ?, ?)`,
        args: [randomUUID(), organizationId, productId, parsed.data.quantityChange, after, userId, parsed.data.note || null]
      });
    });
    return { productId, stock: after };
  }

  async inventoryMovements(organizationId: string) {
    const result = await this.database.execute(
      `SELECT m.id, m.product_id, p.name AS product_name, m.movement_type, m.quantity_change, m.stock_after, m.note, m.created_at
       FROM inventory_movements m JOIN products p ON p.id = m.product_id AND p.organization_id = m.organization_id
       WHERE m.organization_id = ? ORDER BY m.created_at DESC LIMIT 200`,
      [organizationId]
    );
    return result.rows;
  }

  async customerLedger(organizationId: string, customerId: string) {
    const customer = await this.database.execute(
      `SELECT id, name, phone, outstanding_balance FROM customers WHERE id = ? AND organization_id = ? AND deleted_at IS NULL LIMIT 1`,
      [customerId, organizationId]
    );
    if (!customer.rows.length) throw new NotFoundException('Customer not found');
    const result = await this.database.execute(
      `SELECT 'INVOICE' AS event_type, i.invoice_number AS reference, 'Invoice issued' AS description,
        i.grand_total AS debit, 0 AS credit, i.created_at AS event_time
       FROM invoices i WHERE i.organization_id = ? AND i.customer_id = ? AND i.status NOT IN ('CANCELLED','REFUNDED')
       UNION ALL
       SELECT 'PAYMENT', i.invoice_number, COALESCE(p.note, 'Payment received'), 0, p.amount, p.created_at
       FROM payments p JOIN invoices i ON i.id = p.invoice_id AND i.organization_id = p.organization_id
       WHERE p.organization_id = ? AND i.customer_id = ? AND p.status = 'CAPTURED'
       ORDER BY event_time DESC`,
      [organizationId, customerId, organizationId, customerId]
    );
    let balance = 0;
    const timeline = (result.rows as unknown as Array<DbRecord & { debit:number; credit:number }>)
      .reverse().map((row) => {
        balance += Number(row.debit ?? 0) - Number(row.credit ?? 0);
        return { ...row, running_balance: Math.max(0, balance) };
      }).reverse();
    return { customer: customer.rows[0], events: timeline };
  }

  async dashboardSummary(organizationId: string, todayStart: string) {
    const [today, lowStock, outstanding, recent] = await Promise.all([
      this.database.execute(
        `SELECT COALESCE(SUM(grand_total), 0) AS sales, COUNT(*) AS bills FROM invoices
         WHERE organization_id = ? AND created_at >= ? AND status != 'CANCELLED'`,
        [organizationId, todayStart]
      ),
      this.database.execute(
        `SELECT COUNT(*) AS count FROM products WHERE organization_id = ? AND active = 1
         AND deleted_at IS NULL AND stock <= low_stock_threshold`,
        [organizationId]
      ),
      this.database.execute(`SELECT COALESCE(SUM(outstanding_balance), 0) AS amount FROM customers WHERE organization_id = ? AND deleted_at IS NULL`, [organizationId]),
      this.database.execute(
        `SELECT id, invoice_number, grand_total, payment_status, created_at FROM invoices
         WHERE organization_id = ? ORDER BY created_at DESC LIMIT 5`,
        [organizationId]
      )
    ]);
    const row = (rows: typeof today.rows) => rows[0] as unknown as DbRecord | undefined;
    return {
      todaySales: Number(row(today.rows)?.sales ?? 0),
      todayBills: Number(row(today.rows)?.bills ?? 0),
      lowStock: Number(row(lowStock.rows)?.count ?? 0),
      outstanding: Number(row(outstanding.rows)?.amount ?? 0),
      recentInvoices: recent.rows
    };
  }

  async reportSummary(organizationId: string, from: string, to: string) {
    const [totals, breakdown, topProducts, lowStock, dailySales, staffSales] = await Promise.all([
      this.database.execute(
        `SELECT COALESCE(SUM(grand_total),0) AS sales, COALESCE(SUM(amount_paid),0) AS collected,
          COALESCE(SUM(amount_due),0) AS due, COUNT(*) AS billCount, COALESCE(AVG(grand_total),0) AS averageBill
         FROM invoices WHERE organization_id = ? AND invoice_date >= ? AND invoice_date <= ? AND status NOT IN ('CANCELLED','REFUNDED')`,
        [organizationId, from, to]
      ),
      this.database.execute(
        `SELECT method, SUM(amount) AS amount FROM payments WHERE organization_id = ? AND status = 'CAPTURED'
         AND created_at >= ? AND created_at <= ? GROUP BY method ORDER BY amount DESC`,
        [organizationId, from, to]
      ),
      this.database.execute(
        `SELECT ii.product_name_snapshot AS name, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS sales FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id AND i.organization_id = ii.organization_id
         WHERE ii.organization_id = ? AND i.invoice_date >= ? AND i.invoice_date <= ? AND i.status NOT IN ('CANCELLED','REFUNDED')
         GROUP BY ii.product_name_snapshot ORDER BY sales DESC LIMIT 10`,
        [organizationId, from, to]
      ),
      this.database.execute(`SELECT id, name, stock, low_stock_threshold AS threshold, unit FROM products WHERE organization_id = ? AND active = 1 AND deleted_at IS NULL AND stock <= low_stock_threshold ORDER BY stock LIMIT 10`, [organizationId]),
      this.database.execute(
        `SELECT date(invoice_date) AS date, COALESCE(SUM(grand_total),0) AS sales, COUNT(*) AS bills FROM invoices
         WHERE organization_id = ? AND invoice_date >= ? AND invoice_date <= ? AND status NOT IN ('CANCELLED','REFUNDED')
         GROUP BY date(invoice_date) ORDER BY date(invoice_date)`,
        [organizationId, from, to]
      ),
      this.database.execute(
        `SELECT COALESCE(up.display_name, sp.full_name, 'Owner') AS name, COALESCE(SUM(i.grand_total),0) AS sales, COUNT(*) AS bills
         FROM invoices i LEFT JOIN user_profiles up ON up.firebase_uid = i.created_by
         LEFT JOIN staff_profiles sp ON sp.user_id = i.created_by AND sp.organization_id = i.organization_id
         WHERE i.organization_id = ? AND i.invoice_date >= ? AND i.invoice_date <= ? AND i.status NOT IN ('CANCELLED','REFUNDED')
         GROUP BY i.created_by ORDER BY sales DESC`,
        [organizationId, from, to]
      )
    ]);
    const row = totals.rows[0] as unknown as DbRecord;
    return {
      summary: {
        sales: Number(row.sales), collected: Number(row.collected), due: Number(row.due),
        billCount: Number(row.billCount), averageBill: Number(row.averageBill)
      },
      paymentBreakdown: breakdown.rows, topProducts: topProducts.rows, lowStock: lowStock.rows,
      dailySales: dailySales.rows, staffSales: staffSales.rows
    };
  }

  async gstReport(organizationId: string, from: string, to: string) {
    const [result, invoices, rates] = await Promise.all([
      this.database.execute(
        `SELECT COALESCE(SUM(taxable_amount),0) AS taxableSales, COALESCE(SUM(cgst),0) AS cgst,
          COALESCE(SUM(sgst),0) AS sgst, COALESCE(SUM(igst),0) AS igst
         FROM invoices WHERE organization_id = ? AND invoice_date >= ? AND invoice_date <= ? AND status NOT IN ('CANCELLED','REFUNDED')`,
        [organizationId, from, to]
      ),
      this.database.execute(`SELECT COUNT(*) AS count, COALESCE(SUM(grand_total),0) AS gross FROM invoices WHERE organization_id = ? AND invoice_date >= ? AND invoice_date <= ? AND status NOT IN ('CANCELLED','REFUNDED')`, [organizationId, from, to]),
      this.database.execute(
        `SELECT ii.tax_rate AS rate, SUM(ii.taxable_amount) AS taxable, SUM(ii.cgst) AS cgst, SUM(ii.sgst) AS sgst,
          SUM(ii.igst) AS igst, SUM(ii.cgst + ii.sgst + ii.igst) AS totalTax, SUM(ii.line_total) AS gross
         FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id AND i.organization_id = ii.organization_id
         WHERE ii.organization_id = ? AND i.invoice_date >= ? AND i.invoice_date <= ? AND i.status NOT IN ('CANCELLED','REFUNDED')
         GROUP BY ii.tax_rate ORDER BY ii.tax_rate`,
        [organizationId, from, to]
      )
    ]);
    const row = result.rows[0] as unknown as DbRecord;
    const invoiceSummary = invoices.rows[0] as unknown as DbRecord;
    const summary = { taxableSales: Number(row.taxableSales), cgst: Number(row.cgst), sgst: Number(row.sgst), igst: Number(row.igst) };
    return {
      summary: {
        invoiceCount: Number(invoiceSummary.count), grossSales: Number(invoiceSummary.gross),
        ...summary, totalTax: summary.cgst + summary.sgst + summary.igst
      },
      rateBreakdown: rates.rows
    };
  }
}
