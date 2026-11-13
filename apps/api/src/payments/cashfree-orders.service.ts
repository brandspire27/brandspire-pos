import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { TursoService } from '../database/turso.service';
import { CashfreeService } from './cashfree.service';
import { getRuntimeConfig } from '../config/runtime-config';

type Cycle = 'MONTHLY' | 'HALF_YEARLY' | 'YEARLY';
type Session = { id:string; organization_id:string; created_by:string; plan_id:string; billing_cycle:Cycle; term_months:number|null; amount:number; currency:string; status:string; subscription_id:string|null; metadata:string };
type Order = { order_id:string; order_status:string; order_amount:number; order_currency:string; payment_session_id?:string };
type Payment = { cf_payment_id:string|number; payment_status:string; payment_amount:number; payment_currency:string; payment_time?:string; payment_group?:string };
const money = (value:unknown) => Math.round(Number(value) * 100);

@Injectable()
export class CashfreeOrdersService {
  constructor(private readonly database:TursoService, private readonly cashfree:CashfreeService) {}

  async checkout(organizationId:string, ownerId:string, email:string, planId:string, cycle:Cycle) {
    const config = getRuntimeConfig();
    if (!this.cashfree.isConfigured()) throw new BadRequestException('Payments are not configured yet.');
    const plan = (await this.database.execute('SELECT * FROM plans WHERE id = ? AND active = 1', [planId])).rows[0];
    const org = (await this.database.execute('SELECT name, phone FROM organizations WHERE id = ?', [organizationId])).rows[0];
    if (!plan || !org) throw new BadRequestException('Plan or business not found');
    const termMonths = cycle === 'YEARLY' ? 12 : cycle === 'HALF_YEARLY' ? 6 : 1;
    const amount = Number(cycle === 'MONTHLY' ? plan.monthly_price : cycle === 'HALF_YEARLY' ? plan.half_yearly_price : plan.yearly_price);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('This plan price is unavailable.');
    if (Number(plan.minimum_months) > termMonths) throw new BadRequestException('This plan requires a longer term. Choose yearly billing.');
    const phone = String(org.phone ?? '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) throw new BadRequestException('Add a valid business mobile number first.');
    if (!config.publicApiUrl) throw new BadRequestException('Public backend URL is missing.');
    // Record before the provider call, so an early webhook or a lost response remains recoverable.
    const id = randomUUID();
    const orderId = `bsp_${id.replace(/-/g, '')}`;
    // Legacy cycle CHECK allows MONTHLY/YEARLY only. term_months is the
    // authoritative purchased duration; six months is six monthly intervals.
    await this.database.execute(`INSERT INTO subscription_checkout_sessions
      (id,organization_id,created_by,plan_id,billing_cycle,amount,currency,provider,provider_order_id,metadata,term_months)
      VALUES (?,?,?,?,?,?,?,'CASHFREE_PG',?,?,?)`,
      [id,organizationId,ownerId,planId,cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY',amount,String(plan.currency),orderId,JSON.stringify({mode:this.cashfree.getEnvironment()}),termMonths]);
    const order = await this.cashfree.request<Order>('/orders', {method:'POST',headers:{'x-idempotency-key':id},body:JSON.stringify({
      order_id:orderId,order_amount:amount,order_currency:plan.currency,
      customer_details:{customer_id:organizationId,customer_name:org.name,customer_email:email,customer_phone:phone},
      order_meta:{return_url:`${config.webOrigins[0]}/owner/subscription?cashfree_order_id=${orderId}`,
        notify_url:`${config.publicApiUrl}/api/payments/cashfree/webhook`},
      order_note:`BrandSpire ${String(plan.name)} ${cycle} - one-time payment`
    })});
    if (!order.payment_session_id || order.order_id !== orderId) throw new BadGatewayException('Cashfree checkout could not be prepared.');
    await this.database.execute('UPDATE subscription_checkout_sessions SET provider_session_id = ? WHERE id = ?', [order.payment_session_id,id]);
    return {sessionId:id,orderId,paymentSessionId:order.payment_session_id,amount,currency:plan.currency,billingCycle:cycle};
  }

  async verify(organizationId:string, ownerId:string, orderId:string) {
    const session = (await this.database.execute(`SELECT * FROM subscription_checkout_sessions
      WHERE provider = 'CASHFREE_PG' AND provider_order_id = ? AND organization_id = ? AND created_by = ?`,
      [orderId,organizationId,ownerId])).rows[0];
    if (!session) throw new BadRequestException('Payment checkout not found');
    return this.reconcile(orderId);
  }

  async reconcile(orderId:string) {
    const row = (await this.database.execute(`SELECT * FROM subscription_checkout_sessions WHERE provider = 'CASHFREE_PG' AND provider_order_id = ?`, [orderId])).rows[0];
    if (!row) throw new BadRequestException('Unknown payment order');
    const session = row as unknown as Session;
    if (JSON.parse(session.metadata).mode !== this.cashfree.getEnvironment()) throw new BadRequestException('Payment environment does not match this checkout.');
    if (session.status === 'ACTIVATED') return {verified:true,providerStatus:'PAID'};
    const order = await this.cashfree.request<Order>(`/orders/${encodeURIComponent(orderId)}`);
    if (order.order_id !== orderId || money(order.order_amount) !== money(session.amount) || order.order_currency !== session.currency)
      throw new BadRequestException('Payment order amount or currency mismatch');
    if (order.order_status !== 'PAID') return {verified:false,providerStatus:order.order_status};
    const payments = await this.cashfree.request<Payment[]>(`/orders/${encodeURIComponent(orderId)}/payments`);
    const payment = payments.find(p => p.payment_status === 'SUCCESS' && money(p.payment_amount) === money(session.amount) && p.payment_currency === session.currency && p.cf_payment_id);
    if (!payment) throw new BadGatewayException('Successful payment is not confirmed yet. Please check again.');
    if (getRuntimeConfig().appEnv === 'production' && this.cashfree.getEnvironment() === 'sandbox') {
      return {verified:false,providerStatus:'TEST_PAYMENT_SUCCESS'};
    }
    const paidAt = payment.payment_time && Number.isFinite(Date.parse(payment.payment_time)) ? new Date(payment.payment_time).toISOString() : new Date().toISOString();
    await this.database.transaction(async tx => {
      // Serializes webhook/return/retry races; one order can extend access only once.
      const fresh = (await tx.execute({sql:'SELECT status FROM subscription_checkout_sessions WHERE id = ?',args:[session.id]})).rows[0];
      if (fresh.status === 'ACTIVATED') return;
      const current = (await tx.execute({sql:'SELECT * FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1',args:[session.organization_id]})).rows[0];
      const now = new Date();
      const remaining = current && ['ACTIVE','TRIAL','GRACE_PERIOD'].includes(String(current.status)) && Date.parse(String(current.ends_at)) > now.getTime();
      const start = remaining ? new Date(String(current.ends_at)) : now;
      const endsAt = addBillingPeriod(start,session.term_months === 6 ? 'HALF_YEARLY' : session.term_months === 12 ? 'YEARLY' : session.billing_cycle);
      const subscriptionId = randomUUID();
      await tx.execute({sql:`INSERT INTO subscriptions(id,organization_id,plan_id,status,starts_at,ends_at,provider,provider_status,billing_cycle,last_payment_at,admin_message,created_at,term_months)
        VALUES (?,?,?,'ACTIVE',?,?,'CASHFREE_PG','PAID',?,?,?,?,?)`,
        args:[subscriptionId,session.organization_id,session.plan_id,now.toISOString(),endsAt,session.billing_cycle,paidAt,'One-time payment. Renew manually; no automatic debit.',
          new Date(Math.max(now.getTime(),Date.parse(String(current?.created_at)) + 1 || 0)).toISOString(),session.term_months ?? (session.billing_cycle === 'YEARLY' ? 12 : 1)]});
      await tx.execute({sql:`INSERT INTO payment_transactions(id,organization_id,subscription_id,checkout_session_id,provider,provider_payment_id,amount,currency,status,method,captured_at,metadata)
        VALUES (?,?,?,?,'CASHFREE_PG',?,?,?,'SUCCESS',?,?,?)`,args:[randomUUID(),session.organization_id,subscriptionId,session.id,String(payment.cf_payment_id),session.amount,session.currency,payment.payment_group ?? null,paidAt,JSON.stringify({order_id:orderId,mode:this.cashfree.getEnvironment()})]});
      await tx.execute({sql:`UPDATE subscription_checkout_sessions SET status='ACTIVATED',subscription_id=?,payment_id=?,signature_verified_at=?,updated_at=? WHERE id=?`,args:[subscriptionId,String(payment.cf_payment_id),now.toISOString(),now.toISOString(),session.id]});
      await tx.execute({sql:`INSERT INTO subscription_events(id,organization_id,subscription_id,provider,event_type,provider_event_id,details) VALUES (?,?,?,'CASHFREE_PG','PAYMENT_VERIFIED',?,?)`,args:[randomUUID(),session.organization_id,subscriptionId,orderId,JSON.stringify({ends_at:endsAt,amount:session.amount})]});
    });
    return {verified:true,providerStatus:'PAID'};
  }

  async webhook(rawBody:Buffer) {
    let payload:any;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch { throw new BadRequestException('Invalid webhook JSON'); }
    const orderId = payload.data?.order?.order_id;
    // Recurring mandate events must never grant access while AutoPay is disabled.
    if (typeof orderId !== 'string') return {ignored:true};
    const eventId = createHash('sha256').update(rawBody).digest('hex');
    const known = (await this.database.execute(`SELECT id FROM subscription_checkout_sessions WHERE provider='CASHFREE_PG' AND provider_order_id=?`,[orderId])).rows[0];
    if (!known) return {ignored:true};
    await this.database.execute(`INSERT INTO payment_webhook_events(id,provider,provider_event_id,event_type,payload_hash) VALUES (?,'CASHFREE',?,?,?) ON CONFLICT(provider,provider_event_id) DO NOTHING`,[randomUUID(),eventId,String(payload.type ?? 'PAYMENT'),eventId]);
    try {
      const result = await this.reconcile(orderId);
      await this.database.execute(`UPDATE payment_webhook_events SET processing_status='PROCESSED',error_message=NULL,processed_at=? WHERE provider='CASHFREE' AND provider_event_id=?`,[new Date().toISOString(),eventId]);
      return result;
    } catch (error) {
      await this.database.execute(`UPDATE payment_webhook_events SET processing_status='FAILED',error_message='Payment reconciliation failed; retry required' WHERE provider='CASHFREE' AND provider_event_id=?`,[eventId]);
      throw error;
    }
  }
}

export function addBillingPeriod(start:Date, cycle:Cycle) {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (cycle === 'YEARLY' ? 12 : cycle === 'HALF_YEARLY' ? 6 : 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
  end.setUTCDate(Math.min(day,last));
  return end.toISOString();
}
