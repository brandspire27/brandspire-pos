import { randomUUID } from 'crypto';
import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { TursoService } from '../database/turso.service';
import { OwnerAuthGuard } from '../owner/owner-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { CashfreeService } from './cashfree.service';
import { CashfreeOrdersService } from './cashfree-orders.service';

type OwnerRequest = { ownerUserId?: string; organizationId?: string; ownerEmail?: string };
type AdminRequest = { adminUserId?: string; adminEmail?: string };
type RawRequest = { rawBody?: Buffer };

const checkoutSchema = z.object({ planId: z.string().uuid(), billingCycle: z.enum(['MONTHLY','HALF_YEARLY','YEARLY']) });
const verifySchema = z.object({ orderId: z.string().regex(/^bsp_[a-f0-9]{32}$/) });
const cancelSchema = z.object({ cancelAtPeriodEnd: z.boolean().default(true) });
const syncPlanSchema = z.object({ billingCycle: z.enum(['MONTHLY','YEARLY']) });

@Controller('owner/subscription')
@UseGuards(OwnerAuthGuard)
export class OwnerSubscriptionController {
  constructor(private readonly database: TursoService, private readonly cashfree: CashfreeService, private readonly orders: CashfreeOrdersService) {}

  @Get('overview')
  async overview(@Req() request: OwnerRequest) {
    const [subscriptionResult, planResult, transactionResult, pendingResult] = await Promise.all([
      this.database.execute(`SELECT id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message, provider, provider_subscription_id, provider_status, billing_cycle, cancel_at_period_end, last_payment_at, next_charge_at, created_at FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 5`, [request.organizationId!]),
      this.database.execute(`SELECT id, code, name, monthly_price, half_yearly_price, yearly_price, currency, minimum_months, features, provider_monthly_plan_id, provider_yearly_plan_id FROM plans WHERE active = 1 ORDER BY monthly_price`),
      this.database.execute(`SELECT id, amount, currency, status, method, provider_payment_id, created_at, captured_at FROM payment_transactions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 20`, [request.organizationId!]),
      this.database.execute(`SELECT provider_order_id AS order_id, amount, currency, created_at FROM subscription_checkout_sessions WHERE organization_id=? AND created_by=? AND provider='CASHFREE_PG' AND status != 'ACTIVATED' ORDER BY created_at DESC LIMIT 5`, [request.organizationId!,request.ownerUserId!])
    ]);
    const subscriptions = subscriptionResult.rows;
    const plans = planResult.rows.map((row) => {
      const item = row as Record<string, unknown>;
      return { ...item, features: JSON.parse(String(item.features ?? '{}')) };
    });
    return {
      success: true,
      data: {
        configured: this.cashfree.isConfigured(),
        mode: this.cashfree.getEnvironment(),
        current: subscriptions[0] ?? null,
        history: subscriptions,
        plans,
        transactions: transactionResult.rows,
        pendingOrders: pendingResult.rows
      }
    };
  }

  @Post('checkout')
  async checkout(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid subscription choice');
    const data = await this.orders.checkout(
      request.organizationId!,
      request.ownerUserId!,
      request.ownerEmail ?? '',
      parsed.data.planId,
      parsed.data.billingCycle
    );
    return { success: true, data };
  }

  @Post('verify')
  async verify(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid Cashfree verification payload');
    return {
      success: true,
      data: await this.orders.verify(
        request.organizationId!,
        request.ownerUserId!,
        parsed.data.orderId
      )
    };
  }

  @Post('cancel')
  async cancel(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = cancelSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid cancellation request');

    const currentResult = await this.database.execute(
      `SELECT id, provider_subscription_id, status, provider FROM subscriptions
       WHERE organization_id = ? AND provider = 'CASHFREE' AND provider_subscription_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [request.organizationId!]
    );
    const current = currentResult.rows[0] as unknown as { id:string; provider_subscription_id:string|null; status:string } | undefined;

    if (!current?.provider_subscription_id) throw new BadRequestException('No Cashfree subscription is available to cancel');

    const provider = await this.cashfree.cancelSubscription(current.provider_subscription_id);
    await this.database.execute(
      `UPDATE subscriptions SET cancel_at_period_end = ?, provider_status = ?, status = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      [parsed.data.cancelAtPeriodEnd ? 1 : 0, provider.subscription_status ?? current.status,
        parsed.data.cancelAtPeriodEnd ? current.status : 'CANCELLED', current.id]
    );
    await this.database.execute(
      `INSERT INTO audit_logs(id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
       VALUES (?, ?, ?, 'OWNER', 'SUBSCRIPTION_CANCEL_REQUESTED', 'SUBSCRIPTION', ?, ?)`,
      [randomUUID(), request.organizationId!, request.ownerUserId!, current.id,
        JSON.stringify({ cancel_at_period_end: parsed.data.cancelAtPeriodEnd, provider: 'CASHFREE' })]
    );

    return {
      success: true,
      data: {
        cancelAtPeriodEnd: parsed.data.cancelAtPeriodEnd,
        providerStatus: provider.subscription_status ?? null
      }
    };
  }
}

@Controller('admin/billing')
@UseGuards(AdminAuthGuard)
export class AdminBillingController {
  constructor(private readonly database: TursoService, private readonly cashfree: CashfreeService) {}

  @Get('overview')
  async overview(@Req() _request: AdminRequest) {
    const [plans, subscriptions, transactions, webhooks] = await Promise.all([
      this.database.execute(`SELECT id, code, name, monthly_price, half_yearly_price, yearly_price, currency, active, provider_monthly_plan_id, provider_yearly_plan_id FROM plans ORDER BY created_at`),
      this.database.execute(`SELECT id, organization_id, status, provider, provider_status, provider_subscription_id, billing_cycle, starts_at, ends_at, created_at FROM subscriptions ORDER BY created_at DESC LIMIT 100`),
      this.database.execute(`SELECT id, organization_id, amount, currency, status, method, provider_payment_id, created_at FROM payment_transactions ORDER BY created_at DESC LIMIT 100`),
      this.database.execute(`SELECT provider_event_id, event_type, processing_status, organization_id, received_at, processed_at, error_message FROM payment_webhook_events WHERE provider = 'CASHFREE' ORDER BY received_at DESC LIMIT 50`)
    ]);

    return {
      success: true,
      data: {
        configured: this.cashfree.isConfigured(),
        provider: 'CASHFREE',
        mode: this.cashfree.getEnvironment(),
        plans: plans.rows,
        subscriptions: subscriptions.rows,
        transactions: transactions.rows,
        webhooks: webhooks.rows
      }
    };
  }

  @Post('plans/:id/sync')
  async syncPlan(@Param('id') planId: string, @Body() body: unknown) {
    const parsed = syncPlanSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Select MONTHLY or YEARLY');

    const result = await this.database.execute(
      `SELECT id, name, monthly_price, half_yearly_price, yearly_price, currency, provider_monthly_plan_id, provider_yearly_plan_id
       FROM plans WHERE id = ? LIMIT 1`,
      [planId]
    );
    const plan = result.rows[0] as unknown as {
      id:string; name:string; monthly_price:number|null; yearly_price:number|null; currency:string;
      provider_monthly_plan_id:string|null; provider_yearly_plan_id:string|null
    } | undefined;
    if (!plan) throw new BadRequestException('Plan not found');

    const existing = parsed.data.billingCycle === 'MONTHLY' ? plan.provider_monthly_plan_id : plan.provider_yearly_plan_id;
    if (existing) return { success: true, data: { providerPlanId: existing, alreadySynced: true } };

    const price = Number(parsed.data.billingCycle === 'MONTHLY' ? plan.monthly_price : plan.yearly_price);
    const providerPlan = await this.cashfree.createPlan(
      plan.name,
      price,
      plan.currency ?? 'INR',
      parsed.data.billingCycle,
      plan.id
    );

    if (!providerPlan.plan_id) throw new BadRequestException('Cashfree did not return a plan ID');

    const field = parsed.data.billingCycle === 'MONTHLY' ? 'provider_monthly_plan_id' : 'provider_yearly_plan_id';
    await this.database.execute(`UPDATE plans SET ${field} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, [providerPlan.plan_id, planId]);
    return { success: true, data: { providerPlanId: providerPlan.plan_id, alreadySynced: false } };
  }
}

@Controller('payments/cashfree')
export class CashfreeWebhookController {
  constructor(private readonly cashfree: CashfreeService, private readonly orders: CashfreeOrdersService) {}

  @Post('webhook')
  async webhook(
    @Req() request: RawRequest,
    @Headers('x-webhook-signature') signature = '',
    @Headers('x-webhook-timestamp') timestamp = ''
  ) {
    const rawBody = request.rawBody;
    if (!rawBody?.length) throw new BadRequestException('Raw Cashfree webhook body is required');
    if (!this.cashfree.verifyWebhookSignature(rawBody, timestamp, signature)) {
      throw new BadRequestException('Invalid Cashfree webhook signature');
    }

    return { success: true, ...(await this.orders.webhook(rawBody)) };
  }

  @Get('return')
  async returnGet(@Query('subscription_id') subscriptionId: string | undefined, @Res() response: Response) {
    return response.redirect(await this.cashfree.getReturnRedirect(subscriptionId));
  }

  @Post('return')
  async returnPost(@Body() body: Record<string, any>, @Res() response: Response) {
    const subscriptionId = String(body?.subscription_id ?? body?.cf_subscription_id ?? '').trim() || undefined;
    return response.redirect(await this.cashfree.getReturnRedirect(subscriptionId));
  }
}
