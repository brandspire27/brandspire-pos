import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SupabaseService } from '../common/supabase.service';

type BillingCycle = 'MONTHLY' | 'YEARLY';
type RazorpaySubscription = {
  id: string;
  plan_id?: string;
  customer_id?: string | null;
  status?: string;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  start_at?: number | null;
  ended_at?: number | null;
};

type RazorpayPayment = {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  order_id?: string | null;
  captured?: boolean;
  created_at?: number;
};

type WebhookPayload = {
  event?: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: RazorpayPayment & { subscription_id?: string } };
  };
};

@Injectable()
export class RazorpayService {
  constructor(private readonly supabase: SupabaseService) {}

  isConfigured() {
    return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
  }

  getPublicKeyId() {
    const value = process.env.RAZORPAY_KEY_ID;
    if (!value) throw new ServiceUnavailableException('Razorpay is not configured yet');
    return value;
  }

  private getSecret() {
    const value = process.env.RAZORPAY_KEY_SECRET;
    if (!value) throw new ServiceUnavailableException('Razorpay is not configured yet');
    return value;
  }

  private getWebhookSecret() {
    const value = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!value) throw new ServiceUnavailableException('Razorpay webhook secret is not configured yet');
    return value;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const keyId = this.getPublicKeyId();
    const secret = this.getSecret();
    const authorization = Buffer.from(`${keyId}:${secret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      }
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const providerMessage = (body?.error as { description?: string } | undefined)?.description;
      throw new BadGatewayException(providerMessage ?? 'Razorpay request failed');
    }
    return body as T;
  }

  async createPlan(name: string, price: number, currency: string, cycle: BillingCycle) {
    if (!Number.isFinite(price) || price <= 0) throw new BadRequestException('Plan price must be greater than zero');
    return this.request<{ id: string }>('/plans', {
      method: 'POST',
      body: JSON.stringify({
        period: cycle === 'MONTHLY' ? 'monthly' : 'yearly',
        interval: 1,
        item: {
          name: `${name} ${cycle === 'MONTHLY' ? 'Monthly' : 'Yearly'}`,
          amount: Math.round(price * 100),
          currency: currency || 'INR',
          description: `Brandspire POS ${cycle.toLowerCase()} subscription`
        },
        notes: { product: 'Brandspire POS', billing_cycle: cycle }
      })
    });
  }

  async createSubscription(providerPlanId: string, organizationId: string, localPlanId: string, cycle: BillingCycle) {
    const totalCount = cycle === 'MONTHLY' ? 120 : 10;
    return this.request<RazorpaySubscription>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: providerPlanId,
        total_count: totalCount,
        quantity: 1,
        customer_notify: true,
        notes: {
          brandspire_organization_id: organizationId,
          brandspire_plan_id: localPlanId,
          billing_cycle: cycle
        }
      })
    });
  }

  async fetchSubscription(providerSubscriptionId: string) {
    return this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`);
  }

  async cancelSubscription(providerSubscriptionId: string, atCycleEnd = true) {
    return this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd })
    });
  }

  verifyCheckoutSignature(paymentId: string, providerSubscriptionId: string, receivedSignature: string) {
    const expected = createHmac('sha256', this.getSecret())
      .update(`${paymentId}|${providerSubscriptionId}`)
      .digest('hex');
    return safeEqual(expected, receivedSignature);
  }

  verifyWebhookSignature(rawBody: Buffer, receivedSignature: string) {
    const expected = createHmac('sha256', this.getWebhookSecret()).update(rawBody).digest('hex');
    return safeEqual(expected, receivedSignature);
  }

  async createCheckoutSession(organizationId: string, ownerUserId: string, planId: string, cycle: BillingCycle) {
    const { data: plan, error } = await this.supabase.admin
      .from('plans')
      .select('id, code, name, monthly_price, yearly_price, currency, provider_monthly_plan_id, provider_yearly_plan_id, active')
      .eq('id', planId)
      .eq('active', true)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!plan) throw new BadRequestException('Subscription plan not found');

    const providerPlanId = cycle === 'MONTHLY' ? plan.provider_monthly_plan_id : plan.provider_yearly_plan_id;
    if (!providerPlanId) throw new BadRequestException(`Razorpay ${cycle.toLowerCase()} plan is not synced by Brandspire Admin yet`);

    const amount = Number(cycle === 'MONTHLY' ? plan.monthly_price : plan.yearly_price);
    const providerSubscription = await this.createSubscription(providerPlanId, organizationId, plan.id, cycle);
    if (!providerSubscription.id) throw new BadGatewayException('Razorpay did not return a subscription ID');

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: session, error: sessionError } = await this.supabase.admin
      .from('subscription_checkout_sessions')
      .insert({
        organization_id: organizationId,
        plan_id: plan.id,
        created_by: ownerUserId,
        billing_cycle: cycle,
        amount,
        currency: plan.currency ?? 'INR',
        provider: 'RAZORPAY',
        provider_subscription_id: providerSubscription.id,
        status: 'CREATED',
        expires_at: expiresAt
      })
      .select('id')
      .single();
    if (sessionError) throw new BadRequestException(sessionError.message);

    return {
      sessionId: session.id,
      keyId: this.getPublicKeyId(),
      subscriptionId: providerSubscription.id,
      planName: plan.name,
      planCode: plan.code,
      amount,
      currency: plan.currency ?? 'INR',
      billingCycle: cycle
    };
  }

  async verifyCheckout(organizationId: string, ownerUserId: string, input: { paymentId: string; subscriptionId: string; signature: string }) {
    const { data: session, error } = await this.supabase.admin
      .from('subscription_checkout_sessions')
      .select('id, organization_id, plan_id, billing_cycle, amount, currency, provider_subscription_id, status')
      .eq('organization_id', organizationId)
      .eq('created_by', ownerUserId)
      .eq('provider_subscription_id', input.subscriptionId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!session) throw new BadRequestException('Subscription checkout session not found');

    if (!this.verifyCheckoutSignature(input.paymentId, input.subscriptionId, input.signature)) {
      throw new BadRequestException('Razorpay payment signature verification failed');
    }

    await this.supabase.admin.from('subscription_checkout_sessions').update({
      status: 'VERIFIED',
      payment_id: input.paymentId,
      signature_verified_at: new Date().toISOString()
    }).eq('id', session.id);

    const providerSubscription = await this.fetchSubscription(input.subscriptionId);
    const local = await this.applyProviderSubscription({
      organizationId,
      providerSubscription,
      providerEventId: null,
      eventType: 'CHECKOUT_VERIFIED',
      fallbackPlanId: session.plan_id,
      billingCycle: session.billing_cycle as BillingCycle
    });

    if (local.subscriptionId) {
      await this.supabase.admin.from('subscription_checkout_sessions').update({ status: 'ACTIVATED' }).eq('id', session.id);
    }

    return { verified: true, providerStatus: providerSubscription.status ?? 'unknown', subscription: local };
  }

  async applyProviderSubscription(input: {
    organizationId: string;
    providerSubscription: RazorpaySubscription;
    providerEventId: string | null;
    eventType: string;
    fallbackPlanId?: string | null;
    billingCycle?: BillingCycle | null;
  }) {
    const providerId = input.providerSubscription.id;
    if (!providerId) return { subscriptionId: null, status: null };

    const { data: checkout } = await this.supabase.admin
      .from('subscription_checkout_sessions')
      .select('plan_id, billing_cycle')
      .eq('provider_subscription_id', providerId)
      .maybeSingle();

    const planId = checkout?.plan_id ?? input.fallbackPlanId ?? null;
    const billingCycle = (checkout?.billing_cycle ?? input.billingCycle ?? null) as BillingCycle | null;
    const mappedStatus = mapProviderStatus(input.providerSubscription.status ?? '');
    const startsAt = unixToIso(input.providerSubscription.current_start ?? input.providerSubscription.start_at) ?? new Date().toISOString();
    const endsAt = unixToIso(input.providerSubscription.current_end);
    const nextChargeAt = unixToIso(input.providerSubscription.charge_at);

    const { data: existing } = await this.supabase.admin
      .from('subscriptions')
      .select('id')
      .eq('provider_subscription_id', providerId)
      .maybeSingle();

    let subscriptionId: string | null = existing?.id ?? null;
    if (existing?.id) {
      const { error } = await this.supabase.admin.from('subscriptions').update({
        status: mappedStatus,
        provider: 'RAZORPAY',
        provider_status: input.providerSubscription.status ?? null,
        provider_customer_id: input.providerSubscription.customer_id ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        next_charge_at: nextChargeAt,
        billing_cycle: billingCycle
      }).eq('id', existing.id);
      if (error) throw new BadRequestException(error.message);
    } else if (planId) {
      const { data: created, error } = await this.supabase.admin.from('subscriptions').insert({
        organization_id: input.organizationId,
        plan_id: planId,
        status: mappedStatus,
        starts_at: startsAt,
        ends_at: endsAt,
        provider: 'RAZORPAY',
        provider_subscription_id: providerId,
        provider_status: input.providerSubscription.status ?? null,
        provider_customer_id: input.providerSubscription.customer_id ?? null,
        billing_cycle: billingCycle,
        next_charge_at: nextChargeAt,
        admin_message: 'Brandspire POS subscription activated through Razorpay.'
      }).select('id').single();
      if (error) throw new BadRequestException(error.message);
      subscriptionId = created.id;
    }

    if (subscriptionId) {
      await this.supabase.admin.from('subscription_events').insert({
        organization_id: input.organizationId,
        subscription_id: subscriptionId,
        event_type: input.eventType,
        provider: 'RAZORPAY',
        provider_event_id: input.providerEventId,
        provider_subscription_id: providerId,
        summary: { provider_status: input.providerSubscription.status ?? null }
      });
    }
    return { subscriptionId, status: mappedStatus };
  }

  async processWebhook(eventId: string, rawBody: Buffer) {
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let parsed: WebhookPayload;
    try { parsed = JSON.parse(rawBody.toString('utf8')) as WebhookPayload; }
    catch { throw new BadRequestException('Invalid webhook JSON'); }

    const eventType = parsed.event ?? 'unknown';
    const providerSubscription = parsed.payload?.subscription?.entity;
    const payment = parsed.payload?.payment?.entity;
    const providerSubscriptionId = providerSubscription?.id ?? payment?.subscription_id ?? null;

    const { error: claimError } = await this.supabase.admin.from('payment_webhook_events').insert({
      provider: 'RAZORPAY',
      provider_event_id: eventId,
      event_type: eventType,
      provider_subscription_id: providerSubscriptionId,
      payload_hash: payloadHash,
      processing_status: 'RECEIVED'
    });
    if (claimError) {
      if (claimError.code === '23505') return { duplicate: true };
      throw new BadRequestException(claimError.message);
    }

    try {
      let organizationId: string | null = null;
      let localSubscriptionId: string | null = null;
      if (providerSubscriptionId) {
        const { data: checkout } = await this.supabase.admin
          .from('subscription_checkout_sessions')
          .select('organization_id, plan_id, billing_cycle')
          .eq('provider_subscription_id', providerSubscriptionId)
          .maybeSingle();
        const { data: localSubscription } = await this.supabase.admin
          .from('subscriptions')
          .select('id, organization_id')
          .eq('provider_subscription_id', providerSubscriptionId)
          .maybeSingle();
        organizationId = checkout?.organization_id ?? localSubscription?.organization_id ?? null;
        localSubscriptionId = localSubscription?.id ?? null;

        if (organizationId && providerSubscription) {
          const applied = await this.applyProviderSubscription({
            organizationId,
            providerSubscription,
            providerEventId: eventId,
            eventType,
            fallbackPlanId: checkout?.plan_id ?? null,
            billingCycle: (checkout?.billing_cycle ?? null) as BillingCycle | null
          });
          localSubscriptionId = applied.subscriptionId ?? localSubscriptionId;
        }
      }

      if (organizationId && payment?.id) {
        await this.supabase.admin.from('payment_transactions').upsert({
          organization_id: organizationId,
          subscription_id: localSubscriptionId,
          provider: 'RAZORPAY',
          provider_payment_id: payment.id,
          provider_order_id: payment.order_id ?? null,
          provider_subscription_id: providerSubscriptionId,
          amount: Number(payment.amount ?? 0) / 100,
          currency: payment.currency ?? 'INR',
          status: payment.status ?? eventType,
          method: payment.method ?? null,
          captured_at: payment.captured || payment.status === 'captured' ? unixToIso(payment.created_at) ?? new Date().toISOString() : null,
          metadata: { webhook_event: eventType }
        }, { onConflict: 'provider_payment_id' });

        if (localSubscriptionId && (eventType === 'subscription.charged' || payment.status === 'captured')) {
          await this.supabase.admin.from('subscriptions').update({ last_payment_at: new Date().toISOString() }).eq('id', localSubscriptionId);
        }
      }

      if (organizationId && providerSubscriptionId && !providerSubscription) {
        const status = eventType === 'payment.failed' || eventType === 'subscription.halted' ? 'PAST_DUE' : null;
        if (status) {
          await this.supabase.admin.from('subscriptions').update({ status, provider_status: eventType }).eq('provider_subscription_id', providerSubscriptionId);
        }
      }

      await this.supabase.admin.from('payment_webhook_events').update({
        organization_id: organizationId,
        processing_status: 'PROCESSED',
        processed_at: new Date().toISOString()
      }).eq('provider_event_id', eventId);
      return { duplicate: false, processed: true };
    } catch (error) {
      await this.supabase.admin.from('payment_webhook_events').update({
        processing_status: 'FAILED',
        error_message: error instanceof Error ? error.message.slice(0, 500) : 'Webhook processing failed'
      }).eq('provider_event_id', eventId);
      throw error;
    }
  }
}

function unixToIso(value: number | null | undefined) {
  return value && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function mapProviderStatus(status: string) {
  const normalized = status.toLowerCase();
  if (['active', 'authenticated', 'created'].includes(normalized)) return normalized === 'created' ? 'PENDING_APPROVAL' : 'ACTIVE';
  if (['pending', 'halted'].includes(normalized)) return 'PAST_DUE';
  if (normalized === 'paused') return 'PAUSED';
  if (normalized === 'cancelled') return 'CANCELLED';
  if (['completed', 'expired'].includes(normalized)) return 'EXPIRED';
  return 'PENDING_APPROVAL';
}

function safeEqual(expected: string, received: string) {
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received ?? '', 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}
