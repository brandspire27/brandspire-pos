import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TursoService } from '../database/turso.service';

const querySchema = z.object({ query: z.string().trim().min(2).max(500) });

type Snapshot = {
  periodDays: number;
  sales: { total: number; bills: number; due: number };
  topProducts: Array<{ name: string; quantity: number; sales: number }>;
  lowStock: Array<{ name: string; stock: number; threshold: number }>;
  outstandingCustomers: Array<{ name: string; amount: number }>;
};

@Injectable()
export class BusinessInsightsService {
  constructor(private readonly database: TursoService) {}

  private async snapshot(organizationId: string): Promise<Snapshot> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [invoiceRes, productRes, customerRes, itemRes] = await Promise.all([
      this.database.execute(
        `SELECT id, grand_total, amount_due FROM invoices WHERE organization_id = ? AND created_at >= ?
         AND status NOT IN ('CANCELLED', 'REFUNDED') ORDER BY created_at DESC LIMIT 3000`,
        [organizationId, since]
      ),
      this.database.execute(
        `SELECT id, name, stock, low_stock_threshold FROM products
         WHERE organization_id = ? AND deleted_at IS NULL AND active = 1 LIMIT 500`,
        [organizationId]
      ),
      this.database.execute(
        `SELECT name, outstanding_balance FROM customers
         WHERE organization_id = ? AND outstanding_balance > 0 AND deleted_at IS NULL
         ORDER BY outstanding_balance DESC LIMIT 15`,
        [organizationId]
      ),
      this.database.execute(
        `SELECT ii.product_name_snapshot, ii.quantity, ii.line_total FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id AND i.organization_id = ii.organization_id
         WHERE ii.organization_id = ? AND i.created_at >= ? AND i.status NOT IN ('CANCELLED', 'REFUNDED') LIMIT 5000`,
        [organizationId, since]
      )
    ]);
    const invoices = invoiceRes.rows as unknown as Array<{ grand_total: number; amount_due: number }>;
    const totals = invoices.reduce(
      (result, invoice) => ({ total: result.total + Number(invoice.grand_total || 0), due: result.due + Number(invoice.amount_due || 0) }),
      { total: 0, due: 0 }
    );
    const productMap = new Map<string, { name: string; quantity: number; sales: number }>();
    for (const row of itemRes.rows as unknown as Array<{ product_name_snapshot: string; quantity: number; line_total: number }>) {
      const name = row.product_name_snapshot;
      const current = productMap.get(name) ?? { name, quantity: 0, sales: 0 };
      current.quantity += Number(row.quantity || 0);
      current.sales += Number(row.line_total || 0);
      productMap.set(name, current);
    }
    const topProducts = [...productMap.values()].sort((a, b) => b.sales - a.sales).slice(0, 10)
      .map((row) => ({ ...row, quantity: Number(row.quantity.toFixed(3)), sales: Number(row.sales.toFixed(2)) }));
    const lowStock = (productRes.rows as unknown as Array<{ name: string; stock: number; low_stock_threshold: number }>)
      .filter((product) => Number(product.stock) <= Number(product.low_stock_threshold))
      .sort((a, b) => Number(a.stock) - Number(b.stock)).slice(0, 15)
      .map((product) => ({ name: product.name, stock: Number(product.stock), threshold: Number(product.low_stock_threshold) }));
    const outstandingCustomers = (customerRes.rows as unknown as Array<{ name: string; outstanding_balance: number }>)
      .map((customer) => ({ name: customer.name, amount: Number(customer.outstanding_balance) }));
    return {
      periodDays: 30,
      sales: { total: Number(totals.total.toFixed(2)), bills: invoices.length, due: Number(totals.due.toFixed(2)) },
      topProducts, lowStock, outstandingCustomers
    };
  }

  async ask(organizationId: string, userId: string, input: unknown) {
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid question');
    const provider = (process.env.AI_PROVIDER ?? '').trim();
    const key = (process.env.AI_PROVIDER_KEY ?? '').trim();
    const baseUrl = (process.env.AI_PROVIDER_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = (process.env.AI_PROVIDER_MODEL ?? '').trim();
    if (!provider || !key || !model) {
      return { configured: false, answer: null, message: 'Online AI provider is not configured. Offline Brandspire Assist remains available.' };
    }
    if (provider !== 'openai-compatible') throw new BadRequestException('Unsupported AI_PROVIDER. Use openai-compatible for Phase 8.');

    const data = await this.snapshot(organizationId);
    const system = [
      'You are Brandspire POS Business Insights for an Indian SMB owner.',
      'Answer only from the supplied controlled business snapshot. Never claim direct database access.',
      'If the snapshot does not support the answer, say that clearly.',
      'Be concise, practical, and do not provide tax/legal/accounting advice.',
      'Respond in the same language/style as the owner question when possible.',
      'Amounts are INR.'
    ].join(' ');
    let errorCode: string | null = null;
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Question: ${parsed.data.query}\n\nControlled 30-day snapshot:\n${JSON.stringify(data)}` }
          ],
          temperature: 0.2,
          max_tokens: 500
        })
      });
      if (!response.ok) {
        errorCode = `HTTP_${response.status}`;
        throw new BadGatewayException('AI provider request failed');
      }
      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const answer = json.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        errorCode = 'EMPTY_RESPONSE';
        throw new BadGatewayException('AI provider returned an empty response');
      }
      await this.writeUsage(organizationId, userId, provider, model, parsed.data.query.length, true);
      return { configured: true, answer, snapshotPeriodDays: data.periodDays };
    } catch (error) {
      await this.writeUsage(organizationId, userId, provider, model, parsed.data.query.length, false, errorCode ?? 'PROVIDER_ERROR');
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(error instanceof Error ? error.message : 'AI provider request failed');
    }
  }

  private async writeUsage(organizationId: string, userId: string, provider: string, model: string, inputChars: number, success: boolean, errorCode?: string) {
    await this.database.execute(
      `INSERT INTO ai_usage_events(id, organization_id, user_id, feature, provider, model, input_chars, success, error_code)
       VALUES (?, ?, ?, 'BUSINESS_INSIGHTS', ?, ?, ?, ?, ?)`,
      [randomUUID(), organizationId, userId, provider, model, inputChars, success ? 1 : 0, errorCode ?? null]
    );
  }
}
