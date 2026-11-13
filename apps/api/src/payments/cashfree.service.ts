import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { TursoService } from '../database/turso.service';
import { getRuntimeConfig } from '../config/runtime-config';

type BillingCycle = 'MONTHLY' | 'YEARLY';

type CashfreePlan = {
  plan_id?: string;
  plan_name?: string;
  plan_status?: string;
};

type CashfreeSubscription = {
  subscription_id?: string;
  cf_subscription_id?: string;
  subscription_status?: string;
  subscription_expiry_time?: string | null;
  subscription_first_charge_time?: string | null;
  plan_details?: {
    plan_id?: string;
    plan_name?: string;
    plan_type?: string;
    plan_currency?: string;
    plan_amount?: number;
    plan_recurring_amount?: number;
    plan_intervals?: number;
    plan_interval_type?: string;
  };
  authorisation_details?: {
    authorization_status?: string;
  };
  authorization_details?: {
    authorization_status?: string;
  };
};

type CashfreeWebhook = {
  type?: string;
  event?: string;
  event_type?: string;
  data?: Record<string, any>;
  payload?: Record<string, any>;
};

@Injectable()
export class CashfreeService {
  private readonly apiVersion = '2025-01-01';

  constructor(private readonly database: TursoService) {}

  isConfigured() {
    const config = getRuntimeConfig();
    return config.cashfreeConfigured;
  }

  getEnvironment() {
    return getRuntimeConfig().cashfreeEnv;
  }

  private getCredentials() {
    const clientId = (process.env.CASHFREE_CLIENT_ID ?? '').trim();
    const clientSecret = (process.env.CASHFREE_CLIENT_SECRET ?? '').trim();
    if (!clientId || !clientSecret) throw new ServiceUnavailableException('Cashfree is not configured yet');
    return { clientId, clientSecret };
  }

  private baseUrl() {
    return this.getEnvironment() === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const { clientId, clientSecret } = this.getCredentials();
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-api-version': this.apiVersion,
        'x-client-id': clientId,
        'x-client-secret': clientSecret,
        ...(init?.headers ?? {})
      }
    });
    const body = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      const message =
        body?.message ??
        body?.error_description ??
        body?.error?.message ??
        body?.error?.description ??
        'Cashfree request failed';
      throw new BadGatewayException(String(message));
    }
    return body as T;
  }

  async createPlan(name: string, price: number, currency: string, cycle: BillingCycle, localPlanId: string) {
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException('Plan price must be greater than zero');
    }

    const planId = `brandspire_${localPlanId}_${cycle.toLowerCase()}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 240);
    return this.request<CashfreePlan>('/plans', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        plan_name: `${name} ${cycle === 'MONTHLY' ? 'Monthly' : 'Yearly'}`,
        plan_type: 'PERIODIC',
        plan_currency: currency || 'INR',
        plan_recurring_amount: Number(price.toFixed(2)),
        plan_max_amount: Number(price.toFixed(2)),
        plan_max_cycles: 0,
        plan_intervals: 1,
        plan_interval_type: cycle === 'MONTHLY' ? 'MONTH' : 'YEAR',
        plan_note: `Brandspire POS ${cycle.toLowerCase()} subscription`
      })
    });
  }

  private async createSubscription(
    providerPlanId: string,
    subscriptionId: string,
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    returnUrl: string,
    localOrganizationId: string,
    localPlanId: string,
    cycle: BillingCycle
  ) {
    return this.request<CashfreeSubscription & { subscription_session_id?: string }>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        subscription_id: subscriptionId,
        customer_details: {
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone
        },
        plan_details: {
          plan_id: providerPlanId,
          plan_type: 'PERIODIC'
        },
        authorization_details: {
          authorization_amount: 1,
          authorization_amount_refund: true
        },
        subscription_meta: {
          return_url: returnUrl,
          notification_channel: ['EMAIL']
        },
        subscription_note: `Brandspire POS ${cycle.toLowerCase()} subscription`,
        subscription_tags: {
          brandspire_organization_id: localOrganizationId,
          brandspire_plan_id: localPlanId,
          billing_cycle: cycle
        }
      })
    });
  }

  async createCheckoutSession(
    organizationId: string,
    ownerUserId: string,
    ownerEmail: string,
    planId: string,
    cycle: BillingCycle
  ) {
    const config = getRuntimeConfig();
    if (!config.cashfreeConfigured) {
      throw new ServiceUnavailableException('Cashfree Sandbox is not configured yet');
    }

    const planResult = await this.database.execute(
      `SELECT id, code, name, monthly_price, yearly_price, currency, provider_monthly_plan_id, provider_yearly_plan_id
       FROM plans WHERE id = ? AND active = 1 LIMIT 1`,
      [planId]
    );
    const plan = planResult.rows[0] as unknown as {
      id:string; code:string; name:string; monthly_price:number|null; yearly_price:number|null; currency:string;
      provider_monthly_plan_id:string|null; provider_yearly_plan_id:string|null
    } | undefined;
    if (!plan) throw new BadRequestException('Subscription plan not found');

    const providerPlanId = cycle === 'MONTHLY' ? plan.provider_monthly_plan_id : plan.provider_yearly_plan_id;
    if (!providerPlanId) {
      throw new BadRequestException(`Cashfree ${cycle.toLowerCase()} plan is not synced by Brandspire Admin yet`);
    }

    const organizationResult = await this.database.execute(
      `SELECT name, phone, email FROM organizations WHERE id = ? LIMIT 1`,
      [organizationId]
    );
    const organization = organizationResult.rows[0] as unknown as { name:string; phone:string; email:string } | undefined;
    if (!organization) throw new BadRequestException('Organization not found');
    const customerPhone = String(organization?.phone ?? '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(customerPhone)) {
      throw new BadRequestException('A valid 10-digit business phone number is required before starting Cashfree checkout');
    }

    const amount = Number(cycle === 'MONTHLY' ? plan.monthly_price : plan.yearly_price);
    const subscriptionId = `bs_${organizationId.slice(0, 8)}_${Date.now()}`;
    const publicApiUrl = config.publicApiUrl;
    const returnUrl =
      (process.env.CASHFREE_RETURN_URL ?? '').trim() ||
      (publicApiUrl ? `${publicApiUrl}/api/payments/cashfree/return` : '');

    if (!returnUrl) {
      throw new ServiceUnavailableException('CASHFREE_RETURN_URL or API_PUBLIC_URL is required for Cashfree checkout');
    }

    const providerSubscription = await this.createSubscription(
      providerPlanId,
      subscriptionId,
      String(organization?.name ?? 'Brandspire Owner'),
      ownerEmail || String(organization?.email ?? ''),
      customerPhone,
      returnUrl,
      organizationId,
      plan.id,
      cycle
    );

    const providerSubscriptionId = providerSubscription.subscription_id ?? subscriptionId;
    const subscriptionSessionId = providerSubscription.subscription_session_id;
    if (!subscriptionSessionId) {
      throw new BadGatewayException('Cashfree did not return a subscription session ID');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const sessionId = randomUUID();
    await this.database.execute(
      `INSERT INTO subscription_checkout_sessions(
        id, organization_id, plan_id, created_by, billing_cycle, amount, currency, provider,
        provider_subscription_id, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CASHFREE', ?, 'CREATED', ?)`,
      [sessionId, organizationId, plan.id, ownerUserId, cycle, amount, plan.currency ?? 'INR', providerSubscriptionId, expiresAt]
    );

    return {
      sessionId,
      subscriptionSessionId,
      subscriptionId: providerSubscriptionId,
      planName: plan.name,
      planCode: plan.code,
      amount,
      currency: plan.currency ?? 'INR',
      billingCycle: cycle
    };
  }

  async fetchSubscription(providerSubscriptionId: string) {
    return this.request<CashfreeSubscription>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`);
  }

  async verifyCheckout(organizationId: string, ownerUserId: string, providerSubscriptionId: string) {
    const sessionResult = await this.database.execute(
      `SELECT id, organization_id, plan_id, billing_cycle, amount, currency, provider_subscription_id, status
       FROM subscription_checkout_sessions
       WHERE organization_id = ? AND created_by = ? AND provider = 'CASHFREE' AND provider_subscription_id = ? LIMIT 1`,
      [organizationId, ownerUserId, providerSubscriptionId]
    );
    const session = sessionResult.rows[0] as unknown as { id:string; plan_id:string|null; billing_cycle:string } | undefined;
    if (!session) throw new BadRequestException('Cashfree subscription checkout session not found');

    const providerSubscription = await this.fetchSubscription(providerSubscriptionId);
    const local = await this.applyProviderSubscription({
      organizationId,
      providerSubscription,
      providerEventId: null,
      eventType: 'CHECKOUT_VERIFIED',
      fallbackPlanId: session.plan_id,
      billingCycle: session.billing_cycle as BillingCycle
    });

    const authorizationStatus =
      providerSubscription.authorisation_details?.authorization_status ??
      providerSubscription.authorization_details?.authorization_status ??
      providerSubscription.subscription_status ??
      'PENDING';

    await this.database.execute(
      `UPDATE subscription_checkout_sessions SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      [['ACTIVE', 'AUTHENTICATED'].includes(String(authorizationStatus).toUpperCase()) ? 'ACTIVATED' : 'VERIFIED', session.id]
    );

    return {
      verified: true,
      providerStatus: String(authorizationStatus),
      subscription: local
    };
  }

  async cancelSubscription(providerSubscriptionId: string) {
    return this.request<CashfreeSubscription>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'CANCEL' })
    });
  }

  verifyWebhookSignature(rawBody: Buffer, timestamp: string, receivedSignature: string) {
    const secret = (process.env.CASHFREE_CLIENT_SECRET ?? '').trim();
    if (!secret || !timestamp || !receivedSignature) return false;
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}${rawBody.toString('utf8')}`)
      .digest('base64');
    return safeEqual(expected, receivedSignature);
  }

  async processWebhook(eventId: string, rawBody: Buffer) {
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let parsed: CashfreeWebhook;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as CashfreeWebhook;
    } catch {
      throw new BadRequestException('Invalid Cashfree webhook JSON');
    }

    const eventType = String(parsed.type ?? parsed.event ?? parsed.event_type ?? 'unknown');
    const data = parsed.data ?? parsed.payload ?? {};
    const subscription =
      data.subscription_details ??
      data.subscription ??
      data.subscription_entity ??
      data;
    const payment =
      data.payment_details ??
      data.payment ??
      data.payment_entity ??
      {};

    const providerSubscriptionId = String(
      subscription.subscription_id ??
      subscription.cf_subscription_id ??
      payment.subscription_id ??
      ''
    ) || null;

    const providerPaymentId = String(
      payment.cf_payment_id ??
      payment.payment_id ??
      ''
    ) || null;

    try {
      await this.database.execute(
        `INSERT INTO payment_webhook_events(id, provider, provider_event_id, event_type, provider_subscription_id, payload_hash, processing_status)
         VALUES (?, 'CASHFREE', ?, ?, ?, ?, 'RECEIVED')`,
        [randomUUID(), eventId, eventType, providerSubscriptionId, payloadHash]
      );
    } catch (error) {
      if (/unique|constraint/i.test(error instanceof Error ? error.message : String(error))) return { duplicate: true };
      throw new BadRequestException('Could not register Cashfree webhook event');
    }

    try {
      let organizationId: string | null = null;
      let localSubscriptionId: string | null = null;

      if (providerSubscriptionId) {
        const [checkoutResult, localResult] = await Promise.all([
          this.database.execute(
            `SELECT organization_id, plan_id, billing_cycle FROM subscription_checkout_sessions
             WHERE provider = 'CASHFREE' AND provider_subscription_id = ? LIMIT 1`,
            [providerSubscriptionId]
          ),
          this.database.execute(
            `SELECT id, organization_id FROM subscriptions
             WHERE provider = 'CASHFREE' AND provider_subscription_id = ? LIMIT 1`,
            [providerSubscriptionId]
          )
        ]);
        const checkout = checkoutResult.rows[0] as unknown as { organization_id:string; plan_id:string|null; billing_cycle:string } | undefined;
        const localSubscription = localResult.rows[0] as unknown as { id:string; organization_id:string } | undefined;

        organizationId = checkout?.organization_id ?? localSubscription?.organization_id ?? null;
        localSubscriptionId = localSubscription?.id ?? null;

        if (organizationId) {
          const provider = await this.fetchSubscription(providerSubscriptionId).catch(() => subscription as CashfreeSubscription);
          const applied = await this.applyProviderSubscription({
            organizationId,
            providerSubscription: provider,
            providerEventId: eventId,
            eventType,
            fallbackPlanId: checkout?.plan_id ?? null,
            billingCycle: (checkout?.billing_cycle ?? null) as BillingCycle | null
          });
          localSubscriptionId = applied.subscriptionId ?? localSubscriptionId;
        }
      }

      if (organizationId && providerPaymentId) {
        const amount = Number(payment.payment_amount ?? payment.amount ?? 0);
        const paymentStatus = String(payment.payment_status ?? payment.status ?? eventType);
        await this.database.execute(
          `INSERT INTO payment_transactions(
            id, organization_id, subscription_id, provider, provider_payment_id, provider_subscription_id,
            amount, currency, status, method, captured_at, metadata
          ) VALUES (?, ?, ?, 'CASHFREE', ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider, provider_payment_id) DO UPDATE SET
            organization_id = excluded.organization_id, subscription_id = excluded.subscription_id,
            provider_subscription_id = excluded.provider_subscription_id, amount = excluded.amount,
            currency = excluded.currency, status = excluded.status, method = excluded.method,
            captured_at = excluded.captured_at, metadata = excluded.metadata`,
          [randomUUID(), organizationId, localSubscriptionId, providerPaymentId, providerSubscriptionId, amount,
            payment.currency ?? 'INR', paymentStatus, payment.payment_method ?? payment.method ?? null,
            ['SUCCESS', 'PAID', 'CAPTURED'].includes(paymentStatus.toUpperCase()) ? new Date().toISOString() : null,
            JSON.stringify({ webhook_event: eventType })]
        );

        if (localSubscriptionId && ['SUCCESS', 'PAID', 'CAPTURED'].includes(paymentStatus.toUpperCase())) {
          await this.database.execute(
            `UPDATE subscriptions SET last_payment_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
            [new Date().toISOString(), localSubscriptionId]
          );
        }
      }

      await this.database.execute(
        `UPDATE payment_webhook_events SET organization_id = ?, processing_status = 'PROCESSED', processed_at = ?
         WHERE provider = 'CASHFREE' AND provider_event_id = ?`,
        [organizationId, new Date().toISOString(), eventId]
      );

      return { duplicate: false, processed: true };
    } catch (error) {
      await this.database.execute(
        `UPDATE payment_webhook_events SET processing_status = 'FAILED', error_message = ?
         WHERE provider = 'CASHFREE' AND provider_event_id = ?`,
        [error instanceof Error ? error.message.slice(0, 500) : 'Webhook processing failed', eventId]
      );
      throw error;
    }
  }

  async applyProviderSubscription(input: {
    organizationId: string;
    providerSubscription: CashfreeSubscription;
    providerEventId: string | null;
    eventType: string;
    fallbackPlanId?: string | null;
    billingCycle?: BillingCycle | null;
  }) {
    const providerId = input.providerSubscription.subscription_id ?? input.providerSubscription.cf_subscription_id;
    if (!providerId) return { subscriptionId: null, status: null };

    const checkoutResult = await this.database.execute(
      `SELECT plan_id, billing_cycle FROM subscription_checkout_sessions
       WHERE provider = 'CASHFREE' AND provider_subscription_id = ? LIMIT 1`,
      [providerId]
    );
    const checkout = checkoutResult.rows[0] as unknown as { plan_id:string|null; billing_cycle:string|null } | undefined;

    const planId = checkout?.plan_id ?? input.fallbackPlanId ?? null;
    const billingCycle = (checkout?.billing_cycle ?? input.billingCycle ?? null) as BillingCycle | null;
    const providerStatus =
      input.providerSubscription.subscription_status ??
      input.providerSubscription.authorisation_details?.authorization_status ??
      input.providerSubscription.authorization_details?.authorization_status ??
      'PENDING';
    const mappedStatus = mapProviderStatus(providerStatus);
    const startsAt = new Date().toISOString();
    const endsAt = input.providerSubscription.subscription_expiry_time ?? null;
    const nextChargeAt = input.providerSubscription.subscription_first_charge_time ?? null;

    const existingResult = await this.database.execute(
      `SELECT id FROM subscriptions WHERE provider = 'CASHFREE' AND provider_subscription_id = ? LIMIT 1`,
      [providerId]
    );
    let subscriptionId = (existingResult.rows[0] as unknown as { id:string } | undefined)?.id ?? null;
    if (subscriptionId) {
      await this.database.execute(
        `UPDATE subscriptions SET status = ?, provider_status = ?, starts_at = ?, ends_at = ?,
          next_charge_at = ?, billing_cycle = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        [mappedStatus, providerStatus, startsAt, endsAt, nextChargeAt, billingCycle, subscriptionId]
      );
    } else if (planId) {
      subscriptionId = randomUUID();
      await this.database.execute(
        `INSERT INTO subscriptions(
          id, organization_id, plan_id, status, starts_at, ends_at, provider, provider_subscription_id,
          provider_status, billing_cycle, next_charge_at, admin_message
        ) VALUES (?, ?, ?, ?, ?, ?, 'CASHFREE', ?, ?, ?, ?, 'Brandspire POS subscription activated through Cashfree.')`,
        [subscriptionId, input.organizationId, planId, mappedStatus, startsAt, endsAt, providerId, providerStatus, billingCycle, nextChargeAt]
      );
    }

    if (subscriptionId) {
      await this.database.execute(
        `INSERT INTO subscription_events(id, organization_id, subscription_id, provider, event_type, provider_event_id, provider_subscription_id, details)
         VALUES (?, ?, ?, 'CASHFREE', ?, ?, ?, ?)`,
        [randomUUID(), input.organizationId, subscriptionId, input.eventType, input.providerEventId, providerId,
          JSON.stringify({ provider_status: providerStatus })]
      );
    }

    return { subscriptionId, status: mappedStatus };
  }

  async getReturnRedirect(subscriptionId: string | undefined) {
    const config = getRuntimeConfig();
    const webUrl = config.webOrigins[0];
    const encoded = encodeURIComponent(subscriptionId ?? '');
    return `${webUrl}/owner/subscription${subscriptionId ? `?cashfree_subscription_id=${encoded}` : '?cashfree_payment=failed'}`;
  }
}

function mapProviderStatus(status: string) {
  const normalized = status.toLowerCase();
  if (['active', 'authenticated', 'success'].includes(normalized)) return 'ACTIVE';
  if (['pending', 'created', 'initiated'].includes(normalized)) return 'PENDING_APPROVAL';
  if (['failed', 'failure', 'halted'].includes(normalized)) return 'PAST_DUE';
  if (['paused'].includes(normalized)) return 'GRACE_PERIOD';
  if (['cancelled', 'canceled'].includes(normalized)) return 'CANCELLED';
  if (['completed', 'expired'].includes(normalized)) return 'EXPIRED';
  return 'PENDING_APPROVAL';
}

function safeEqual(expected: string, received: string) {
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received ?? '', 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
