import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TursoService } from '../database/turso.service';

const approvalSchema = z.object({
  accessMode: z.enum(['TRIAL', 'SUBSCRIPTION']),
  durationDays: z.number().int().min(1).max(3650).optional(),
  durationMonths: z.number().int().min(1).max(120).optional(),
  adminMessage: z.string().trim().max(500).optional().default(''),
  printerType: z.enum(['THERMAL_58MM', 'THERMAL_80MM', 'A4']).nullable().optional(),
  securityDeposit: z.number().min(0).max(1000000).optional().default(0)
});
const suspendSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const restoreSchema = z.object({ note: z.string().trim().max(500).optional().default('') });
const extendSchema = z.object({ days: z.number().int().min(1).max(3650), message: z.string().trim().max(500).optional() });
const messageSchema = z.object({ message: z.string().trim().max(500) });

type OrganizationListInput = { query: string; status: string; attentionOnly: boolean };
type AuditInput = { query: string; organizationId: string; limit: number };
type SubscriptionRow = {
  id: string; organization_id: string; plan_id: string | null; status: string;
  starts_at: string | null; ends_at: string | null; grace_ends_at: string | null;
  admin_message: string | null; provider: string | null; provider_status: string | null;
  billing_cycle: string | null; last_payment_at: string | null; next_charge_at: string | null; created_at: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly database: TursoService) {}

  private async latestSubscription(organizationId: string): Promise<SubscriptionRow | null> {
    const result = await this.database.execute(
      `SELECT id, organization_id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message,
        provider, provider_status, billing_cycle, last_payment_at, next_charge_at, created_at
       FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1`,
      [organizationId]
    );
    return (result.rows[0] as unknown as SubscriptionRow | undefined) ?? null;
  }

  private attentionFor(organizationStatus: string, subscription: SubscriptionRow | null) {
    if (organizationStatus === 'SUSPENDED') return { needsAttention: true, reason: 'ORGANIZATION_SUSPENDED' };
    if (!subscription) return { needsAttention: true, reason: 'NO_SUBSCRIPTION' };
    if (['SUSPENDED', 'EXPIRED', 'PAST_DUE', 'CANCELLED'].includes(subscription.status)) {
      return { needsAttention: true, reason: `SUBSCRIPTION_${subscription.status}` };
    }
    if (subscription.status === 'GRACE_PERIOD') return { needsAttention: true, reason: 'GRACE_PERIOD' };
    if (subscription.ends_at) {
      const remaining = new Date(subscription.ends_at).getTime() - Date.now();
      if (remaining <= 0) return { needsAttention: true, reason: 'ACCESS_EXPIRED' };
      if (remaining <= 7 * 24 * 60 * 60 * 1000) return { needsAttention: true, reason: 'EXPIRING_SOON' };
    }
    return { needsAttention: false, reason: null };
  }

  private async writeAudit(
    organizationId: string | null,
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    summary: Record<string, unknown>
  ) {
    await this.database.execute(
      `INSERT INTO audit_logs(id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
       VALUES (?, ?, ?, 'ADMIN', ?, ?, ?, ?)`,
      [randomUUID(), organizationId, adminUserId, action, entityType, entityId, JSON.stringify(summary)]
    );
  }

  async dashboard() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const [organizations, subscriptions, applications, webhooks, transactions, recentAudit] = await Promise.all([
      this.database.execute(`SELECT id, name, status, email, phone, state, preferred_language, created_at, updated_at FROM organizations ORDER BY created_at DESC LIMIT 500`),
      this.database.execute(`SELECT id, organization_id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message, provider, provider_status, billing_cycle, last_payment_at, next_charge_at, created_at FROM subscriptions ORDER BY created_at DESC LIMIT 2000`),
      this.database.execute(`SELECT COUNT(*) AS count FROM owner_applications WHERE status = 'PENDING'`),
      this.database.execute(`SELECT COUNT(*) AS count FROM payment_webhook_events WHERE processing_status = 'FAILED' AND received_at >= ?`, [sevenDaysAgo]),
      this.database.execute(`SELECT amount, status, created_at FROM payment_transactions WHERE provider = 'CASHFREE' AND created_at >= ? LIMIT 5000`, [thirtyDaysAgo]),
      this.database.execute(`SELECT id, organization_id, actor_role, action, entity_type, entity_id, summary, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 12`)
    ]);
    const latestByOrganization = new Map<string, SubscriptionRow>();
    for (const subscription of subscriptions.rows as unknown as SubscriptionRow[]) {
      if (!latestByOrganization.has(subscription.organization_id)) latestByOrganization.set(subscription.organization_id, subscription);
    }
    const tenants = (organizations.rows as unknown as Array<Record<string, unknown> & { id: string; status: string }>)
      .map((organization) => {
        const subscription = latestByOrganization.get(organization.id) ?? null;
        return { ...organization, subscription, ...this.attentionFor(organization.status, subscription) };
      });
    const captured30d = (transactions.rows as unknown as Array<{ amount: number; status: string }>)
      .filter((transaction) => ['captured', 'CAPTURED', 'SUCCESS', 'PAID'].includes(transaction.status))
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
    const count = (result: { rows: unknown[] }) => Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
    return {
      metrics: {
        totalOrganizations: tenants.length,
        activeOrganizations: tenants.filter((tenant) => tenant.status === 'ACTIVE').length,
        suspendedOrganizations: tenants.filter((tenant) => tenant.status === 'SUSPENDED').length,
        trialSubscriptions: tenants.filter((tenant) => tenant.subscription?.status === 'TRIAL').length,
        activeSubscriptions: tenants.filter((tenant) => tenant.subscription?.status === 'ACTIVE').length,
        expiringSoon: tenants.filter((tenant) => tenant.reason === 'EXPIRING_SOON').length,
        attentionRequired: tenants.filter((tenant) => tenant.needsAttention).length,
        pendingApplications: count(applications),
        failedWebhooks7d: count(webhooks),
        capturedSubscriptionRevenue30d: captured30d
      },
      attention: tenants.filter((tenant) => tenant.needsAttention).slice(0, 12),
      recentOrganizations: tenants.slice(0, 8),
      recentAudit: recentAudit.rows
    };
  }

  async listApplications(status = 'PENDING') {
    const normalized = ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : 'PENDING';
    const result = await this.database.execute(
      `SELECT id, auth_user_id, email, owner_name, business_name, phone, business_type, gstin, state, address,
        preferred_language, status, admin_note, reviewed_at, created_at
       FROM owner_applications WHERE status = ? ORDER BY created_at DESC`,
      [normalized]
    );
    return result.rows;
  }

  async approve(applicationId: string, adminUserId: string, input: unknown) {
    const parsed = approvalSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid approval data');
    const values = parsed.data;
    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    if (values.accessMode === 'TRIAL') endsAt.setUTCDate(endsAt.getUTCDate() + (values.durationDays ?? 3));
    else endsAt.setUTCMonth(endsAt.getUTCMonth() + (values.durationMonths ?? 1));
    const applicationResult = await this.database.execute(
      `SELECT * FROM owner_applications WHERE id = ? AND status = 'PENDING' LIMIT 1`,
      [applicationId]
    );
    const application = applicationResult.rows[0] as unknown as {
      id: string; auth_user_id: string; email: string; owner_name: string; business_name: string;
      phone: string; gstin: string | null; state: string | null; address: string | null; preferred_language: string;
    } | undefined;
    if (!application) throw new NotFoundException('Owner application not found or already reviewed');
    const planResult = values.accessMode === 'SUBSCRIPTION'
      ? await this.database.execute(`SELECT id FROM plans WHERE code = 'BASIC' AND active = 1 LIMIT 1`)
      : { rows: [] };
    const planId = (planResult.rows[0] as unknown as { id: string } | undefined)?.id ?? null;
    const organizationId = randomUUID();
    const slug = `${application.business_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'business'}-${organizationId.slice(0, 8)}`;
    const subscriptionId = randomUUID();
    await this.database.transaction(async (tx) => {
      await tx.execute({
        sql: `UPDATE owner_applications SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, updated_at = ?
              WHERE id = ? AND status = 'PENDING'`,
        args: [adminUserId, startsAt.toISOString(), startsAt.toISOString(), applicationId]
      });
      await tx.execute({
        sql: `INSERT INTO organizations(id, name, slug, status, owner_user_id, gstin, phone, email, address, state, preferred_language)
              VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)`,
        args: [organizationId, application.business_name, slug, application.auth_user_id, application.gstin, application.phone,
          application.email, application.address, application.state, application.preferred_language]
      });
      await tx.execute({
        sql: `INSERT INTO organization_members(id, organization_id, user_id, role, active) VALUES (?, ?, ?, 'OWNER', 1)`,
        args: [randomUUID(), organizationId, application.auth_user_id]
      });
      await tx.execute({ sql: `INSERT INTO organization_settings(organization_id) VALUES (?)`, args: [organizationId] });
      await tx.execute({
        sql: `INSERT INTO subscriptions(id, organization_id, plan_id, status, starts_at, ends_at, approved_by, approved_at, admin_message)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [subscriptionId, organizationId, planId, values.accessMode === 'TRIAL' ? 'TRIAL' : 'ACTIVE',
          startsAt.toISOString(), endsAt.toISOString(), adminUserId, startsAt.toISOString(), values.adminMessage || null]
      });
      if (values.printerType) {
        await tx.execute({
          sql: `INSERT INTO printer_assets(id, organization_id, printer_type, ownership, security_deposit, deposit_status, active)
                VALUES (?, ?, ?, 'BRANDSPIRE', ?, ?, 1)`,
          args: [randomUUID(), organizationId, values.printerType, values.securityDeposit, values.securityDeposit > 0 ? 'PENDING' : 'NOT_REQUIRED']
        });
      }
      await tx.execute({
        sql: `INSERT INTO audit_logs(id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
              VALUES (?, ?, ?, 'ADMIN', 'OWNER_APPLICATION_APPROVED', 'OWNER_APPLICATION', ?, ?)`,
        args: [randomUUID(), organizationId, adminUserId, applicationId, JSON.stringify({ access_mode: values.accessMode })]
      });
    });
    return { organizationId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  }

  async reject(applicationId: string, adminUserId: string, note: string) {
    const cleanNote = z.string().trim().max(500).parse(note ?? '');
    const now = new Date().toISOString();
    const update = await this.database.execute(
      `UPDATE owner_applications SET status = 'REJECTED', admin_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'PENDING'`,
      [cleanNote || null, adminUserId, now, now, applicationId]
    );
    if (update.rowsAffected === 0) throw new NotFoundException('Owner application not found or already reviewed');
    await this.writeAudit(null, adminUserId, 'OWNER_APPLICATION_REJECTED', 'OWNER_APPLICATION', applicationId, { note: cleanNote });
    return { rejected: true };
  }

  async listOrganizations(input: OrganizationListInput) {
    const result = await this.database.execute(
      `SELECT o.id, o.name, o.status, o.email, o.phone, o.state, o.preferred_language, o.created_at, o.updated_at,
        s.id AS subscription_id, s.organization_id AS subscription_organization_id, s.plan_id, s.status AS subscription_status,
        s.starts_at, s.ends_at, s.grace_ends_at, s.admin_message, s.provider, s.provider_status,
        s.billing_cycle, s.last_payment_at, s.next_charge_at, s.created_at AS subscription_created_at
       FROM organizations o
       LEFT JOIN subscriptions s ON s.id = (
         SELECT id FROM subscriptions WHERE organization_id = o.id ORDER BY created_at DESC LIMIT 1
       )
       ORDER BY o.created_at DESC LIMIT 1000`
    );
    const query = input.query.trim().toLowerCase();
    const normalizedStatus = ['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING', 'CLOSED'].includes(input.status) ? input.status : 'ALL';
    return result.rows.map((row) => {
      const item = row as unknown as Record<string, unknown> & { id: string; status: string };
      const subscription = item.subscription_id ? {
        id: item.subscription_id, organization_id: item.subscription_organization_id, plan_id: item.plan_id,
        status: item.subscription_status, starts_at: item.starts_at, ends_at: item.ends_at, grace_ends_at: item.grace_ends_at,
        admin_message: item.admin_message, provider: item.provider, provider_status: item.provider_status,
        billing_cycle: item.billing_cycle, last_payment_at: item.last_payment_at, next_charge_at: item.next_charge_at,
        created_at: item.subscription_created_at
      } as SubscriptionRow : null;
      const organization = { ...item, subscription, ...this.attentionFor(item.status, subscription) } as
        Record<string, unknown> & { id: string; status: string; needsAttention: boolean; name?: unknown; email?: unknown; phone?: unknown; state?: unknown };
      return organization;
    }).filter((organization) => normalizedStatus === 'ALL' || organization.status === normalizedStatus)
      .filter((organization) => !input.attentionOnly || organization.needsAttention)
      .filter((organization) => !query || [organization.name, organization.email, organization.phone, organization.state]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }

  async organizationDetail(organizationId: string) {
    const [organization, members, subscriptions, printers, staff, invoices, transactions, audit] = await Promise.all([
      this.database.execute(`SELECT * FROM organizations WHERE id = ?`, [organizationId]),
      this.database.execute(`SELECT id, user_id, role, active, created_at, updated_at FROM organization_members WHERE organization_id = ? ORDER BY created_at`, [organizationId]),
      this.database.execute(`SELECT id, plan_id, status, starts_at, ends_at, grace_ends_at, approved_at, admin_message, provider, provider_subscription_id, provider_status, billing_cycle, cancel_at_period_end, last_payment_at, next_charge_at, created_at, updated_at FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 20`, [organizationId]),
      this.database.execute(`SELECT id, asset_tag, serial_number, printer_type, ownership, security_deposit, deposit_status, issued_at, returned_at, return_condition, active, created_at FROM printer_assets WHERE organization_id = ? ORDER BY created_at DESC`, [organizationId]),
      this.database.execute(`SELECT user_id, full_name, email, phone, last_login_at, created_at FROM staff_profiles WHERE organization_id = ? ORDER BY created_at DESC`, [organizationId]),
      this.database.execute(`SELECT id, invoice_number, status, payment_status, payment_method, grand_total, amount_paid, amount_due, invoice_date, created_by_role FROM invoices WHERE organization_id = ? ORDER BY invoice_date DESC LIMIT 20`, [organizationId]),
      this.database.execute(`SELECT id, provider, provider_payment_id, amount, currency, status, method, captured_at, created_at FROM payment_transactions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 20`, [organizationId]),
      this.database.execute(`SELECT id, actor_role, action, entity_type, entity_id, summary, created_at FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50`, [organizationId])
    ]);
    const organizationRow = organization.rows[0] as unknown as (Record<string, unknown> & { status: string }) | undefined;
    if (!organizationRow) throw new NotFoundException('Organization not found');
    const subs = subscriptions.rows as unknown as SubscriptionRow[];
    const currentSubscription = subs[0] ?? null;
    return {
      organization: organizationRow, currentSubscription,
      attention: this.attentionFor(organizationRow.status, currentSubscription),
      members: members.rows, staff: staff.rows, subscriptions: subs, printers: printers.rows,
      invoices: invoices.rows, transactions: transactions.rows, audit: audit.rows
    };
  }

  async suspendOrganization(organizationId: string, adminUserId: string, input: unknown) {
    const parsed = suspendSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Reason is required');
    const subscription = await this.latestSubscription(organizationId);
    const organization = await this.database.execute(`SELECT status FROM organizations WHERE id = ?`, [organizationId]);
    if (!organization.rows.length) throw new NotFoundException('Organization not found');
    await this.database.transaction(async (tx) => {
      await tx.execute({ sql: `UPDATE organizations SET status = 'SUSPENDED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, args: [organizationId] });
      if (subscription) await tx.execute({ sql: `UPDATE subscriptions SET status = 'SUSPENDED', admin_message = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, args: [parsed.data.reason, subscription.id] });
    });
    await this.writeAudit(organizationId, adminUserId, 'ORGANIZATION_SUSPENDED', 'ORGANIZATION', organizationId, {
      reason: parsed.data.reason, previous_organization_status: (organization.rows[0] as unknown as { status: string }).status,
      previous_subscription_status: subscription?.status ?? null
    });
    return { suspended: true };
  }

  async restoreOrganization(organizationId: string, adminUserId: string, input: unknown) {
    const parsed = restoreSchema.safeParse(input ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid restore request');
    const subscription = await this.latestSubscription(organizationId);
    if (!subscription) throw new BadRequestException('No subscription exists for this organization');
    if (subscription.ends_at && new Date(subscription.ends_at).getTime() <= Date.now()) {
      throw new BadRequestException('Access period has expired. Extend access before restoring this organization.');
    }
    const restoredStatus = subscription.plan_id ? 'ACTIVE' : 'TRIAL';
    await this.database.transaction(async (tx) => {
      await tx.execute({ sql: `UPDATE organizations SET status = 'ACTIVE', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, args: [organizationId] });
      await tx.execute({
        sql: `UPDATE subscriptions SET status = ?, admin_message = COALESCE(?, admin_message), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        args: [restoredStatus, parsed.data.note || null, subscription.id]
      });
    });
    await this.writeAudit(organizationId, adminUserId, 'ORGANIZATION_ACCESS_RESTORED', 'ORGANIZATION', organizationId, {
      restored_subscription_status: restoredStatus, note: parsed.data.note || null
    });
    return { restored: true, subscriptionStatus: restoredStatus };
  }

  async extendOrganization(organizationId: string, adminUserId: string, input: unknown) {
    const parsed = extendSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid extension');
    const subscription = await this.latestSubscription(organizationId);
    if (!subscription) throw new BadRequestException('No subscription exists for this organization');
    const now = Date.now();
    const currentEnd = subscription.ends_at ? new Date(subscription.ends_at).getTime() : now;
    const newEndsAt = new Date(Math.max(now, Number.isFinite(currentEnd) ? currentEnd : now) + parsed.data.days * 86400000).toISOString();
    const restoredStatus = subscription.plan_id ? 'ACTIVE' : 'TRIAL';
    await this.database.transaction(async (tx) => {
      await tx.execute({
        sql: `UPDATE subscriptions SET ends_at = ?, grace_ends_at = NULL, status = ?, admin_message = COALESCE(?, admin_message), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        args: [newEndsAt, restoredStatus, parsed.data.message ?? null, subscription.id]
      });
      await tx.execute({ sql: `UPDATE organizations SET status = 'ACTIVE', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, args: [organizationId] });
    });
    await this.writeAudit(organizationId, adminUserId, 'SUBSCRIPTION_ACCESS_EXTENDED', 'SUBSCRIPTION', subscription.id, {
      added_days: parsed.data.days, previous_ends_at: subscription.ends_at, new_ends_at: newEndsAt,
      status: restoredStatus, message: parsed.data.message ?? null
    });
    return { extended: true, endsAt: newEndsAt, subscriptionStatus: restoredStatus };
  }

  async updateAdminMessage(organizationId: string, adminUserId: string, input: unknown) {
    const parsed = messageSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid message');
    const subscription = await this.latestSubscription(organizationId);
    if (!subscription) throw new BadRequestException('No subscription exists for this organization');
    await this.database.execute(
      `UPDATE subscriptions SET admin_message = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      [parsed.data.message || null, subscription.id]
    );
    await this.writeAudit(organizationId, adminUserId, 'ADMIN_MESSAGE_UPDATED', 'SUBSCRIPTION', subscription.id, { message: parsed.data.message || null });
    return { updated: true };
  }

  async auditTrail(input: AuditInput) {
    const limit = Number.isFinite(input.limit) ? Math.min(Math.max(Math.trunc(input.limit), 1), 250) : 100;
    const validOrganization = z.string().uuid().safeParse(input.organizationId).success;
    const rows = await this.database.execute(
      `SELECT id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, request_id, summary, created_at
       FROM audit_logs ${validOrganization ? 'WHERE organization_id = ?' : ''}
       ORDER BY created_at DESC LIMIT ?`,
      validOrganization ? [input.organizationId, limit] : [limit]
    );
    const query = input.query.trim().toLowerCase();
    return rows.rows.filter((row) => {
      if (!query) return true;
      const item = row as Record<string, unknown>;
      return [item.action, item.actor_role, item.entity_type, item.summary]
        .some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }
}
