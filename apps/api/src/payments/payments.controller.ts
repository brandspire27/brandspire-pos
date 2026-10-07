import { createHash } from 'crypto';
import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { SupabaseService } from '../common/supabase.service';
import { OwnerAuthGuard } from '../owner/owner-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { CashfreeService } from './cashfree.service';

type OwnerRequest = { ownerUserId?: string; organizationId?: string; ownerEmail?: string };
type AdminRequest = { adminUserId?: string; adminEmail?: string };
type RawRequest = { rawBody?: Buffer };

const checkoutSchema = z.object({ planId: z.string().uuid(), billingCycle: z.enum(['MONTHLY','YEARLY']) });
const verifySchema = z.object({ subscriptionId: z.string().min(4) });
const cancelSchema = z.object({ cancelAtPeriodEnd: z.boolean().default(true) });
const syncPlanSchema = z.object({ billingCycle: z.enum(['MONTHLY','YEARLY']) });

@Controller('owner/subscription')
@UseGuards(OwnerAuthGuard)
export class OwnerSubscriptionController {
  constructor(private readonly supabase: SupabaseService, private readonly cashfree: CashfreeService) {}

  @Get('overview')
  async overview(@Req() request: OwnerRequest) {
    const [{ data: subscriptions }, { data: plans }, { data: transactions }] = await Promise.all([
      this.supabase.admin.from('subscriptions').select('id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message, provider, provider_subscription_id, provider_status, billing_cycle, cancel_at_period_end, last_payment_at, next_charge_at, created_at').eq('organization_id', request.organizationId!).order('created_at', { ascending: false }).limit(5),
      this.supabase.admin.from('plans').select('id, code, name, monthly_price, yearly_price, currency, minimum_months, features, provider_monthly_plan_id, provider_yearly_plan_id').eq('active', true).order('monthly_price', { ascending: true }),
      this.supabase.admin.from('payment_transactions').select('id, amount, currency, status, method, provider_payment_id, created_at, captured_at').eq('organization_id', request.organizationId!).order('created_at', { ascending: false }).limit(20)
    ]);
    return {
      success: true,
      data: {
        configured: this.cashfree.isConfigured(),
        mode: this.cashfree.getEnvironment(),
        current: subscriptions?.[0] ?? null,
        history: subscriptions ?? [],
        plans: plans ?? [],
        transactions: transactions ?? []
      }
    };
  }

  @Post('checkout')
  async checkout(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid subscription choice');
    const data = await this.cashfree.createCheckoutSession(
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
      data: await this.cashfree.verifyCheckout(
        request.organizationId!,
        request.ownerUserId!,
        parsed.data.subscriptionId
      )
    };
  }

  @Post('cancel')
  async cancel(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = cancelSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid cancellation request');

    const { data: current } = await this.supabase.admin.from('subscriptions')
      .select('id, provider_subscription_id, status, provider')
      .eq('organization_id', request.organizationId!)
      .eq('provider', 'CASHFREE')
      .not('provider_subscription_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (!current?.provider_subscription_id) throw new BadRequestException('No Cashfree subscription is available to cancel');

    const provider = await this.cashfree.cancelSubscription(current.provider_subscription_id);
    await this.supabase.admin.from('subscriptions').update({
      cancel_at_period_end: parsed.data.cancelAtPeriodEnd,
      provider_status: provider.subscription_status ?? current.status,
      ...(parsed.data.cancelAtPeriodEnd ? {} : { status: 'CANCELLED' })
    }).eq('id', current.id);

    await this.supabase.admin.from('audit_logs').insert({
      organization_id: request.organizationId!,
      actor_user_id: request.ownerUserId!,
      actor_role: 'OWNER',
      action: 'SUBSCRIPTION_CANCEL_REQUESTED',
      entity_type: 'SUBSCRIPTION',
      entity_id: current.id,
      summary: { cancel_at_period_end: parsed.data.cancelAtPeriodEnd, provider: 'CASHFREE' }
    });

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
  constructor(private readonly supabase: SupabaseService, private readonly cashfree: CashfreeService) {}

  @Get('overview')
  async overview(@Req() _request: AdminRequest) {
    const [{ data: plans }, { data: subscriptions }, { data: transactions }, { data: webhooks }] = await Promise.all([
      this.supabase.admin.from('plans').select('id, code, name, monthly_price, yearly_price, currency, active, provider_monthly_plan_id, provider_yearly_plan_id').order('created_at'),
      this.supabase.admin.from('subscriptions').select('id, organization_id, status, provider, provider_status, provider_subscription_id, billing_cycle, starts_at, ends_at, created_at').order('created_at', { ascending: false }).limit(100),
      this.supabase.admin.from('payment_transactions').select('id, organization_id, amount, currency, status, method, provider_payment_id, created_at').order('created_at', { ascending: false }).limit(100),
      this.supabase.admin.from('payment_webhook_events').select('provider_event_id, event_type, processing_status, organization_id, received_at, processed_at, error_message').eq('provider', 'CASHFREE').order('received_at', { ascending: false }).limit(50)
    ]);

    return {
      success: true,
      data: {
        configured: this.cashfree.isConfigured(),
        provider: 'CASHFREE',
        mode: this.cashfree.getEnvironment(),
        plans: plans ?? [],
        subscriptions: subscriptions ?? [],
        transactions: transactions ?? [],
        webhooks: webhooks ?? []
      }
    };
  }

  @Post('plans/:id/sync')
  async syncPlan(@Param('id') planId: string, @Body() body: unknown) {
    const parsed = syncPlanSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Select MONTHLY or YEARLY');

    const { data: plan, error } = await this.supabase.admin.from('plans')
      .select('id, name, monthly_price, yearly_price, currency, provider_monthly_plan_id, provider_yearly_plan_id')
      .eq('id', planId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!plan) throw new BadRequestException('Plan not found');

    const field = parsed.data.billingCycle === 'MONTHLY' ? 'provider_monthly_plan_id' : 'provider_yearly_plan_id';
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

    const { error: updateError } = await this.supabase.admin.from('plans').update({
      [field]: providerPlan.plan_id
    }).eq('id', planId);

    if (updateError) throw new BadRequestException(updateError.message);
    return { success: true, data: { providerPlanId: providerPlan.plan_id, alreadySynced: false } };
  }
}

@Controller('payments/cashfree')
export class CashfreeWebhookController {
  constructor(private readonly cashfree: CashfreeService) {}

  @Post('webhook')
  async webhook(
    @Req() request: RawRequest,
    @Headers('x-webhook-signature') signature = '',
    @Headers('x-webhook-timestamp') timestamp = '',
    @Headers('x-webhook-id') webhookId = ''
  ) {
    const rawBody = request.rawBody;
    if (!rawBody?.length) throw new BadRequestException('Raw Cashfree webhook body is required');
    if (!this.cashfree.verifyWebhookSignature(rawBody, timestamp, signature)) {
      throw new BadRequestException('Invalid Cashfree webhook signature');
    }

    const eventId = webhookId || createFallbackEventId(rawBody, timestamp);
    return { success: true, ...(await this.cashfree.processWebhook(eventId, rawBody)) };
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

function createFallbackEventId(rawBody: Buffer, timestamp: string) {
  return createHash('sha256').update(`${timestamp}:${rawBody.toString('utf8')}`).digest('hex');
}
