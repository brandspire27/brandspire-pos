import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getRuntimeConfig } from '../config/runtime-config';
import { TursoService } from '../database/turso.service';
import { CashfreeService } from './cashfree.service';

const verifySchema = z.object({ orderId: z.string().regex(/^bspi_[a-f0-9]{32}$/) });
const money = (value: unknown) => Math.round(Number(value) * 100);

type Application = {
  id: string;
  email: string;
  business_name: string;
  phone: string;
  status: string;
  installation_package_code: string | null;
  installation_amount: number | null;
  installation_payment_method: string | null;
};
type CheckoutSession = {
  id: string;
  application_id: string;
  provider: string;
  provider_order_id: string | null;
  provider_session_id: string | null;
  amount: number;
  currency: string;
  status: string;
  request_payload: string | null;
  metadata: string;
};
type CashfreeOrder = {
  order_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
  payment_session_id?: string;
};
type CashfreePayment = {
  cf_payment_id: string | number;
  payment_status: string;
  payment_amount: number;
  payment_currency: string;
  payment_time?: string;
  payment_group?: string;
};

@Injectable()
export class InstallationPaymentsService {
  constructor(private readonly database: TursoService, private readonly cashfree: CashfreeService) {}

  async checkout(ownerUserId: string) {
    if (!this.cashfree.isConfigured()) throw new BadRequestException('Payments are not configured yet.');
    const applicationResult = await this.database.execute(
      `SELECT id, email, business_name, phone, status, installation_package_code, installation_amount,
         installation_payment_method
       FROM owner_applications WHERE auth_user_id = ? LIMIT 1`,
      [ownerUserId]
    );
    const application = applicationResult.rows[0] as unknown as Application | undefined;
    if (!application) throw new BadRequestException('Submit an owner application before starting installation payment.');
    if (application.status !== 'PENDING') throw new BadRequestException('Installation checkout is only available for pending applications.');
    if (application.installation_payment_method !== 'CASHFREE') {
      throw new BadRequestException('This application did not choose Cashfree for installation payment.');
    }
    if (!application.installation_package_code || !application.installation_amount) {
      throw new BadRequestException('Choose an available printer package before paying.');
    }

    const config = getRuntimeConfig();
    if (!config.publicApiUrl) throw new BadRequestException('Public backend URL is missing.');
    const paidResult = await this.database.execute(
      `SELECT provider_order_id, amount, currency FROM installation_checkout_sessions
       WHERE application_id = ? AND provider = 'CASHFREE_PG' AND status = 'PAID'
       ORDER BY created_at DESC LIMIT 1`,
      [application.id]
    );
    const paidSession = paidResult.rows[0] as unknown as { provider_order_id: string; amount: number; currency: string } | undefined;
    if (paidSession) {
      return {
        orderId: paidSession.provider_order_id,
        paymentSessionId: null,
        amount: paidSession.amount,
        currency: paidSession.currency,
        mode: this.cashfree.getEnvironment(),
        alreadyPaid: true
      };
    }
    let session = await this.reserveSession(application, config.publicApiUrl, config.webOrigins[0]);
    if (session.provider_session_id && session.provider_order_id) {
      const current = await this.reconcile(session.provider_order_id);
      if (current.verified || current.providerStatus === 'TEST_PAYMENT_SUCCESS') {
        return {
          orderId: session.provider_order_id,
          paymentSessionId: null,
          amount: session.amount,
          currency: session.currency,
          mode: this.cashfree.getEnvironment(),
          alreadyPaid: current.verified
        };
      }
      if (current.providerStatus === 'EXPIRED' || current.providerStatus === 'TERMINATED') {
        session = await this.reserveSession(application, config.publicApiUrl, config.webOrigins[0]);
      } else {
        return this.checkoutResult(session, session.provider_session_id);
      }
    }
    if (!session.provider_order_id || !session.request_payload) {
      throw new BadGatewayException('Cashfree installation checkout could not be prepared.');
    }

    const order = await this.cashfree.request<CashfreeOrder>('/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': session.id },
      body: session.request_payload
    });
    if (!order.payment_session_id || order.order_id !== session.provider_order_id) {
      throw new BadGatewayException('Cashfree installation checkout could not be prepared.');
    }
    await this.database.execute(
      `UPDATE installation_checkout_sessions SET provider_session_id = ?, updated_at = ?
       WHERE id = ? AND status = 'CREATED'`,
      [order.payment_session_id, new Date().toISOString(), session.id]
    );
    return this.checkoutResult(session, order.payment_session_id);
  }

  async verify(ownerUserId: string, input: unknown) {
    const parsed = verifySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid installation payment verification payload.');
    const owned = await this.database.execute(
      `SELECT 1 FROM installation_checkout_sessions s
       JOIN owner_applications a ON a.id = s.application_id
       WHERE s.provider = 'CASHFREE_PG' AND s.provider_order_id = ? AND a.auth_user_id = ? LIMIT 1`,
      [parsed.data.orderId, ownerUserId]
    );
    if (!owned.rows.length) throw new BadRequestException('Installation checkout not found.');
    return this.reconcile(parsed.data.orderId);
  }

  async refreshForApplication(applicationId: string) {
    const result = await this.database.execute(
      `SELECT provider_order_id, provider, status
       FROM installation_checkout_sessions WHERE application_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [applicationId]
    );
    const session = result.rows[0] as unknown as { provider_order_id: string | null; provider: string; status: string } | undefined;
    if (session?.provider === 'CASHFREE_PG' && session.status === 'CREATED' && session.provider_order_id) {
      await this.reconcile(session.provider_order_id);
    }
    const refreshed = await this.database.execute(
      `SELECT provider, status FROM installation_checkout_sessions
       WHERE application_id = ? ORDER BY created_at DESC LIMIT 1`,
      [applicationId]
    );
    return refreshed.rows[0] as unknown as { provider: string; status: string } | undefined;
  }

  async collectCash(applicationId: string, adminUserId: string) {
    return this.database.transaction(async tx => {
      const result = await tx.execute({
        sql: `SELECT s.id, s.status, s.amount, a.installation_package_code
              FROM installation_checkout_sessions s
              JOIN owner_applications a ON a.id = s.application_id
              WHERE s.application_id = ? AND s.provider = 'CASH_ON_INSTALLATION'
              ORDER BY s.created_at DESC LIMIT 1`,
        args: [applicationId]
      });
      const session = result.rows[0] as unknown as { id: string; status: string; amount: number; installation_package_code: string | null } | undefined;
      if (!session) throw new BadRequestException('Cash-on-installation charge not found.');
      if (session.status === 'COLLECTED') return { collected: true, alreadyCollected: true };
      if (session.status !== 'DUE') throw new BadRequestException('This installation charge is not awaiting cash collection.');

      const now = new Date().toISOString();
      const updated = await tx.execute({
        sql: `UPDATE installation_checkout_sessions SET status = 'COLLECTED', collected_at = ?, collected_by = ?, updated_at = ?
              WHERE id = ? AND status = 'DUE'`,
        args: [now, adminUserId, now, session.id]
      });
      if (!updated.rowsAffected) throw new BadRequestException('Cash collection status changed. Refresh and try again.');
      await tx.execute({
        sql: `INSERT INTO audit_logs(id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
              VALUES (?, NULL, ?, 'ADMIN', 'INSTALLATION_CASH_COLLECTED', 'OWNER_APPLICATION', ?, ?)`,
        args: [randomUUID(), adminUserId, applicationId, JSON.stringify({
          amount: session.amount,
          package_code: session.installation_package_code
        })]
      });
      return { collected: true, alreadyCollected: false };
    });
  }

  async webhook(rawBody: Buffer) {
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, any>;
    } catch {
      throw new BadRequestException('Invalid webhook JSON.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Invalid webhook payload.');
    }
    const orderId = payload.data?.order?.order_id;
    if (typeof orderId !== 'string') return { ignored: true };
    const known = await this.database.execute(
      `SELECT id FROM installation_checkout_sessions WHERE provider = 'CASHFREE_PG' AND provider_order_id = ?`,
      [orderId]
    );
    if (!known.rows.length) return { ignored: true };

    const eventId = createHash('sha256').update(rawBody).digest('hex');
    await this.database.execute(
      `INSERT INTO payment_webhook_events(id, provider, provider_event_id, event_type, payload_hash)
       VALUES (?, 'CASHFREE', ?, ?, ?) ON CONFLICT(provider, provider_event_id) DO NOTHING`,
      [randomUUID(), eventId, String(payload.type ?? 'PAYMENT'), eventId]
    );
    try {
      const result = await this.reconcile(orderId);
      if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK' && !result.verified && result.providerStatus !== 'TEST_PAYMENT_SUCCESS') {
        throw new BadGatewayException('Installation payment confirmation is pending. Retry this notification.');
      }
      await this.database.execute(
        `UPDATE payment_webhook_events SET processing_status = 'PROCESSED', error_message = NULL, processed_at = ?
         WHERE provider = 'CASHFREE' AND provider_event_id = ?`,
        [new Date().toISOString(), eventId]
      );
      return result;
    } catch (error) {
      await this.database.execute(
        `UPDATE payment_webhook_events SET processing_status = 'FAILED', error_message = 'Installation payment reconciliation failed; retry required'
         WHERE provider = 'CASHFREE' AND provider_event_id = ?`,
        [eventId]
      );
      throw error;
    }
  }

  private checkoutResult(session: CheckoutSession, paymentSessionId: string) {
    return {
      orderId: session.provider_order_id!,
      paymentSessionId,
      amount: session.amount,
      currency: session.currency,
      mode: this.cashfree.getEnvironment(),
      alreadyPaid: false
    };
  }

  private async reserveSession(application: Application, publicApiUrl: string, webOrigin: string): Promise<CheckoutSession> {
    return this.database.transaction(async tx => {
      const existing = await tx.execute({
        sql: `SELECT * FROM installation_checkout_sessions
              WHERE application_id = ? AND provider = 'CASHFREE_PG' AND status = 'CREATED'
              ORDER BY created_at DESC LIMIT 1`,
        args: [application.id]
      });
      if (existing.rows[0]) return existing.rows[0] as unknown as CheckoutSession;

      const id = randomUUID();
      const orderId = `bspi_${id.replace(/-/g, '')}`;
      const requestPayload = JSON.stringify({
        order_id: orderId,
        order_amount: application.installation_amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: application.id,
          customer_name: application.business_name,
          customer_email: application.email,
          customer_phone: application.phone
        },
        order_meta: {
          return_url: `${webOrigin}/auth/status?installation_order_id=${orderId}`,
          notify_url: `${publicApiUrl}/api/payments/cashfree/webhook`
        },
        order_note: `Brandspire POS installation - ${application.installation_package_code}`
      });
      await tx.execute({
        sql: `INSERT INTO installation_checkout_sessions
              (id, application_id, provider, provider_order_id, amount, currency, status, request_payload, metadata)
              VALUES (?, ?, 'CASHFREE_PG', ?, ?, 'INR', 'CREATED', ?, ?)`,
        args: [id, application.id, orderId, application.installation_amount, requestPayload,
          JSON.stringify({ mode: this.cashfree.getEnvironment() })]
      });
      return {
        id,
        application_id: application.id,
        provider: 'CASHFREE_PG',
        provider_order_id: orderId,
        provider_session_id: null,
        amount: application.installation_amount!,
        currency: 'INR',
        status: 'CREATED',
        request_payload: requestPayload,
        metadata: JSON.stringify({ mode: this.cashfree.getEnvironment() })
      };
    });
  }

  private async reconcile(orderId: string) {
    const result = await this.database.execute(
      `SELECT * FROM installation_checkout_sessions WHERE provider = 'CASHFREE_PG' AND provider_order_id = ? LIMIT 1`,
      [orderId]
    );
    const session = result.rows[0] as unknown as CheckoutSession | undefined;
    if (!session) throw new BadRequestException('Unknown installation payment order.');
    const mode = JSON.parse(session.metadata).mode;
    if (mode !== this.cashfree.getEnvironment()) {
      throw new BadRequestException('Payment environment does not match this checkout.');
    }
    if (session.status === 'PAID') return { verified: true, providerStatus: 'PAID' };

    const order = await this.cashfree.request<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`);
    if (order.order_id !== orderId || money(order.order_amount) !== money(session.amount) || order.order_currency !== session.currency) {
      throw new BadRequestException('Payment order amount or currency mismatch.');
    }
    if (order.order_status !== 'PAID') {
      if (['EXPIRED', 'TERMINATED'].includes(order.order_status)) {
        await this.database.execute(
          `UPDATE installation_checkout_sessions SET status = 'CLOSED', updated_at = ?
           WHERE id = ? AND status = 'CREATED'`,
          [new Date().toISOString(), session.id]
        );
      }
      return { verified: false, providerStatus: order.order_status };
    }

    const payments = await this.cashfree.request<CashfreePayment[]>(`/orders/${encodeURIComponent(orderId)}/payments`);
    const payment = payments.find(item =>
      item.payment_status === 'SUCCESS' &&
      money(item.payment_amount) === money(session.amount) &&
      item.payment_currency === session.currency &&
      item.cf_payment_id
    );
    if (!payment) throw new BadGatewayException('Successful installation payment is not confirmed yet. Please check again.');
    if (getRuntimeConfig().appEnv === 'production' && this.cashfree.getEnvironment() === 'sandbox') {
      return { verified: false, providerStatus: 'TEST_PAYMENT_SUCCESS' };
    }

    const paidAt = payment.payment_time && Number.isFinite(Date.parse(payment.payment_time))
      ? new Date(payment.payment_time).toISOString()
      : new Date().toISOString();
    await this.database.transaction(async tx => {
      const fresh = await tx.execute({
        sql: `SELECT status FROM installation_checkout_sessions WHERE id = ?`,
        args: [session.id]
      });
      if (fresh.rows[0]?.status === 'PAID') return;
      await tx.execute({
        sql: `UPDATE installation_checkout_sessions
              SET status = 'PAID', provider_payment_id = ?, paid_at = ?, metadata = ?, updated_at = ?
              WHERE id = ? AND status IN ('CREATED', 'CLOSED')`,
        args: [String(payment.cf_payment_id), paidAt, JSON.stringify({
          mode,
          order_id: orderId,
          payment_group: payment.payment_group ?? null
        }), new Date().toISOString(), session.id]
      });
    });
    return { verified: true, providerStatus: 'PAID' };
  }
}
