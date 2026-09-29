import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SupabaseService } from '../common/supabase.service';
import { OwnerAuthGuard } from '../owner/owner-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { RazorpayService } from './razorpay.service';

type OwnerRequest = { ownerUserId?: string; organizationId?: string; ownerEmail?: string };
type AdminRequest = { adminUserId?: string; adminEmail?: string };
type RawRequest = { rawBody?: Buffer };

const checkoutSchema = z.object({ planId: z.string().uuid(), billingCycle: z.enum(['MONTHLY','YEARLY']) });
const verifySchema = z.object({ paymentId: z.string().min(4), subscriptionId: z.string().min(4), signature: z.string().min(16) });
const cancelSchema = z.object({ cancelAtPeriodEnd: z.boolean().default(true) });
const syncPlanSchema = z.object({ billingCycle: z.enum(['MONTHLY','YEARLY']) });

@Controller('owner/subscription')
@UseGuards(OwnerAuthGuard)
export class OwnerSubscriptionController {
  constructor(private readonly supabase: SupabaseService, private readonly razorpay: RazorpayService) {}

  @Get('overview')
  async overview(@Req() request: OwnerRequest) {
    const [{ data: subscriptions }, { data: plans }, { data: transactions }] = await Promise.all([
      this.supabase.admin.from('subscriptions').select('id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message, provider, provider_subscription_id, provider_status, billing_cycle, cancel_at_period_end, last_payment_at, next_charge_at, created_at').eq('organization_id', request.organizationId!).order('created_at', { ascending: false }).limit(5),
      this.supabase.admin.from('plans').select('id, code, name, monthly_price, yearly_price, currency, minimum_months, features, provider_monthly_plan_id, provider_yearly_plan_id').eq('active', true).order('monthly_price', { ascending: true }),
      this.supabase.admin.from('payment_transactions').select('id, amount, currency, status, method, provider_payment_id, created_at, captured_at').eq('organization_id', request.organizationId!).order('created_at', { ascending: false }).limit(20)
    ]);
    return { success: true, data: { configured: this.razorpay.isConfigured(), current: subscriptions?.[0] ?? null, history: subscriptions ?? [], plans: plans ?? [], transactions: transactions ?? [] } };
  }

  @Post('checkout')
  async checkout(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid subscription choice');
    const data = await this.razorpay.createCheckoutSession(request.organizationId!, request.ownerUserId!, parsed.data.planId, parsed.data.billingCycle);
    return { success: true, data: { ...data, ownerEmail: request.ownerEmail ?? '' } };
  }

  @Post('verify')
  async verify(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid Razorpay verification payload');
    return { success: true, data: await this.razorpay.verifyCheckout(request.organizationId!, request.ownerUserId!, parsed.data) };
  }

  @Post('cancel')
  async cancel(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = cancelSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid cancellation request');
    const { data: current } = await this.supabase.admin.from('subscriptions')
      .select('id, provider_subscription_id, status')
      .eq('organization_id', request.organizationId!)
      .not('provider_subscription_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (!current?.provider_subscription_id) throw new BadRequestException('No Razorpay subscription is available to cancel');
    const provider = await this.razorpay.cancelSubscription(current.provider_subscription_id, parsed.data.cancelAtPeriodEnd);
    await this.supabase.admin.from('subscriptions').update({
      cancel_at_period_end: parsed.data.cancelAtPeriodEnd,
      provider_status: provider.status ?? current.status,
      ...(parsed.data.cancelAtPeriodEnd ? {} : { status: 'CANCELLED' })
    }).eq('id', current.id);
    await this.supabase.admin.from('audit_logs').insert({
      organization_id: request.organizationId!, actor_user_id: request.ownerUserId!, actor_role: 'OWNER', action: 'SUBSCRIPTION_CANCEL_REQUESTED', entity_type: 'SUBSCRIPTION', entity_id: current.id, summary: { cancel_at_period_end: parsed.data.cancelAtPeriodEnd }
    });
    return { success: true, data: { cancelAtPeriodEnd: parsed.data.cancelAtPeriodEnd, providerStatus: provider.status ?? null } };
  }
}

@Controller('admin/billing')
@UseGuards(AdminAuthGuard)
export class AdminBillingController {
  constructor(private readonly supabase: SupabaseService, private readonly razorpay: RazorpayService) {}

  @Get('overview')
  async overview(@Req() _request: AdminRequest) {
    const [{ data: plans }, { data: subscriptions }, { data: transactions }, { data: webhooks }] = await Promise.all([
      this.supabase.admin.from('plans').select('id, code, name, monthly_price, yearly_price, currency, active, provider_monthly_plan_id, provider_yearly_plan_id').order('created_at'),
      this.supabase.admin.from('subscriptions').select('id, organization_id, status, provider, provider_status, provider_subscription_id, billing_cycle, starts_at, ends_at, created_at').order('created_at', { ascending: false }).limit(100),
      this.supabase.admin.from('payment_transactions').select('id, organization_id, amount, currency, status, method, provider_payment_id, created_at').order('created_at', { ascending: false }).limit(100),
      this.supabase.admin.from('payment_webhook_events').select('provider_event_id, event_type, processing_status, organization_id, received_at, processed_at, error_message').order('received_at', { ascending: false }).limit(50)
    ]);
    return { success: true, data: { configured: this.razorpay.isConfigured(), plans: plans ?? [], subscriptions: subscriptions ?? [], transactions: transactions ?? [], webhooks: webhooks ?? [] } };
  }

  @Post('plans/:id/sync')
  async syncPlan(@Param('id') planId: string, @Body() body: unknown) {
    const parsed = syncPlanSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Select MONTHLY or YEARLY');
    const { data: plan, error } = await this.supabase.admin.from('plans').select('id, name, monthly_price, yearly_price, currency, provider_monthly_plan_id, provider_yearly_plan_id').eq('id', planId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!plan) throw new BadRequestException('Plan not found');
    const field = parsed.data.billingCycle === 'MONTHLY' ? 'provider_monthly_plan_id' : 'provider_yearly_plan_id';
    const existing = parsed.data.billingCycle === 'MONTHLY' ? plan.provider_monthly_plan_id : plan.provider_yearly_plan_id;
    if (existing) return { success: true, data: { providerPlanId: existing, alreadySynced: true } };
    const price = Number(parsed.data.billingCycle === 'MONTHLY' ? plan.monthly_price : plan.yearly_price);
    const providerPlan = await this.razorpay.createPlan(plan.name, price, plan.currency ?? 'INR', parsed.data.billingCycle);
    const { error: updateError } = await this.supabase.admin.from('plans').update({ [field]: providerPlan.id }).eq('id', planId);
    if (updateError) throw new BadRequestException(updateError.message);
    return { success: true, data: { providerPlanId: providerPlan.id, alreadySynced: false } };
  }
}

@Controller('payments/razorpay')
export class RazorpayWebhookController {
  constructor(private readonly razorpay: RazorpayService) {}

  @Post('webhook')
  async webhook(
    @Req() request: RawRequest,
    @Headers('x-razorpay-signature') signature = '',
    @Headers('x-razorpay-event-id') eventId = ''
  ) {
    const rawBody = request.rawBody;
    if (!rawBody?.length) throw new BadRequestException('Raw Razorpay webhook body is required');
    if (!eventId) throw new BadRequestException('Missing Razorpay event ID');
    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) throw new BadRequestException('Invalid Razorpay webhook signature');
    return { success: true, ...(await this.razorpay.processWebhook(eventId, rawBody)) };
  }
}
