import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { SupabaseService } from '../common/supabase.service';

const approvalSchema = z.object({
  accessMode: z.enum(['TRIAL', 'SUBSCRIPTION']),
  durationDays: z.number().int().min(1).max(3650).optional(),
  durationMonths: z.number().int().min(1).max(120).optional(),
  adminMessage: z.string().trim().max(500).optional().default(''),
  printerType: z.enum(['THERMAL_58MM', 'THERMAL_80MM', 'A4']).nullable().optional(),
  securityDeposit: z.number().min(0).max(1000000).optional().default(0)
});

const suspendSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

const restoreSchema = z.object({
  note: z.string().trim().max(500).optional().default('')
});

const extendSchema = z.object({
  days: z.number().int().min(1).max(3650),
  message: z.string().trim().max(500).optional()
});

const messageSchema = z.object({
  message: z.string().trim().max(500)
});

type OrganizationListInput = {
  query: string;
  status: string;
  attentionOnly: boolean;
};

type AuditInput = {
  query: string;
  organizationId: string;
  limit: number;
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_id: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  grace_ends_at: string | null;
  admin_message: string | null;
  provider: string | null;
  provider_status: string | null;
  billing_cycle: string | null;
  last_payment_at: string | null;
  next_charge_at: string | null;
  created_at: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseService) {}

  private async latestSubscription(organizationId: string): Promise<SubscriptionRow | null> {
    const { data, error } = await this.supabase.admin
      .from('subscriptions')
      .select('id, organization_id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message, provider, provider_status, billing_cycle, last_payment_at, next_charge_at, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return (data as SubscriptionRow | null) ?? null;
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
    const { error } = await this.supabase.admin.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: adminUserId,
      actor_role: 'ADMIN',
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary
    });
    if (error) throw new BadRequestException(error.message);
  }

  async dashboard() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: organizations, error: organizationsError },
      { data: subscriptions, error: subscriptionsError },
      { count: pendingApplications, error: applicationsError },
      { count: failedWebhooks, error: webhookError },
      { data: transactions, error: transactionError },
      { data: recentAudit, error: auditError }
    ] = await Promise.all([
      this.supabase.admin
        .from('organizations')
        .select('id, name, status, email, phone, state, preferred_language, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(500),
      this.supabase.admin
        .from('subscriptions')
        .select('id, organization_id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message, provider, provider_status, billing_cycle, last_payment_at, next_charge_at, created_at')
        .order('created_at', { ascending: false })
        .limit(2000),
      this.supabase.admin
        .from('owner_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING'),
      this.supabase.admin
        .from('payment_webhook_events')
        .select('id', { count: 'exact', head: true })
        .eq('processing_status', 'FAILED')
        .gte('received_at', sevenDaysAgo),
      this.supabase.admin
        .from('payment_transactions')
        .select('amount, status, created_at')
        .eq('provider', 'CASHFREE')
        .gte('created_at', thirtyDaysAgo)
        .limit(5000),
      this.supabase.admin
        .from('audit_logs')
        .select('id, organization_id, actor_role, action, entity_type, entity_id, summary, created_at')
        .order('created_at', { ascending: false })
        .limit(12)
    ]);

    const firstError = organizationsError ?? subscriptionsError ?? applicationsError ?? webhookError ?? transactionError ?? auditError;
    if (firstError) throw new BadRequestException(firstError.message);

    const latestByOrganization = new Map<string, SubscriptionRow>();
    for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
      if (!latestByOrganization.has(subscription.organization_id)) {
        latestByOrganization.set(subscription.organization_id, subscription);
      }
    }

    const tenants = (organizations ?? []).map((organization) => {
      const subscription = latestByOrganization.get(organization.id) ?? null;
      const attention = this.attentionFor(organization.status, subscription);
      return { ...organization, subscription, ...attention };
    });

    const captured30d = (transactions ?? [])
      .filter((transaction) => ['captured', 'CAPTURED', 'SUCCESS', 'PAID'].includes(String(transaction.status)))
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

    return {
      metrics: {
        totalOrganizations: tenants.length,
        activeOrganizations: tenants.filter((tenant) => tenant.status === 'ACTIVE').length,
        suspendedOrganizations: tenants.filter((tenant) => tenant.status === 'SUSPENDED').length,
        trialSubscriptions: tenants.filter((tenant) => tenant.subscription?.status === 'TRIAL').length,
        activeSubscriptions: tenants.filter((tenant) => tenant.subscription?.status === 'ACTIVE').length,
        expiringSoon: tenants.filter((tenant) => tenant.reason === 'EXPIRING_SOON').length,
        attentionRequired: tenants.filter((tenant) => tenant.needsAttention).length,
        pendingApplications: pendingApplications ?? 0,
        failedWebhooks7d: failedWebhooks ?? 0,
        capturedSubscriptionRevenue30d: captured30d
      },
      attention: tenants.filter((tenant) => tenant.needsAttention).slice(0, 12),
      recentOrganizations: tenants.slice(0, 8),
      recentAudit: recentAudit ?? []
    };
  }

  async listApplications(status = 'PENDING') {
    const normalizedStatus = ['PENDING', 'APPROVED', 'REJECTED'].includes(status)
      ? status
      : 'PENDING';

    const { data, error } = await this.supabase.admin
      .from('owner_applications')
      .select(
        'id, auth_user_id, email, owner_name, business_name, phone, business_type, gstin, state, address, preferred_language, status, admin_note, reviewed_at, created_at'
      )
      .eq('status', normalizedStatus)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async approve(applicationId: string, adminUserId: string, input: unknown) {
    const parsed = approvalSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid approval data');
    }

    const values = parsed.data;
    const startsAt = new Date();
    const endsAt = new Date(startsAt);

    if (values.accessMode === 'TRIAL') {
      endsAt.setUTCDate(endsAt.getUTCDate() + (values.durationDays ?? 3));
    } else {
      endsAt.setUTCMonth(endsAt.getUTCMonth() + (values.durationMonths ?? 1));
    }

    let planId: string | null = null;
    if (values.accessMode === 'SUBSCRIPTION') {
      const { data: plan } = await this.supabase.admin
        .from('plans')
        .select('id')
        .eq('code', 'BASIC')
        .eq('active', true)
        .maybeSingle();
      planId = plan?.id ?? null;
    }

    const { data, error } = await this.supabase.admin.rpc('approve_owner_application', {
      p_application_id: applicationId,
      p_admin_user_id: adminUserId,
      p_access_mode: values.accessMode,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
      p_plan_id: planId,
      p_admin_message: values.adminMessage,
      p_printer_type: values.printerType ?? null,
      p_security_deposit: values.securityDeposit
    });

    if (error) {
      if (error.message.toLowerCase().includes('not found')) throw new NotFoundException(error.message);
      throw new BadRequestException(error.message);
    }

    return { organizationId: data, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  }

  async reject(applicationId: string, adminUserId: string, note: string) {
    const cleanNote = z.string().trim().max(500).parse(note ?? '');
    const { error } = await this.supabase.admin.rpc('reject_owner_application', {
      p_application_id: applicationId,
      p_admin_user_id: adminUserId,
      p_admin_note: cleanNote
    });
    if (error) throw new BadRequestException(error.message);
    return { rejected: true };
  }

  async listOrganizations(input: OrganizationListInput) {
    const [{ data: organizations, error: organizationsError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      this.supabase.admin
        .from('organizations')
        .select('id, name, status, email, phone, state, preferred_language, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(1000),
      this.supabase.admin
        .from('subscriptions')
        .select('id, organization_id, plan_id, status, starts_at, ends_at, grace_ends_at, admin_message, provider, provider_status, billing_cycle, last_payment_at, next_charge_at, created_at')
        .order('created_at', { ascending: false })
        .limit(4000)
    ]);

    const firstError = organizationsError ?? subscriptionsError;
    if (firstError) throw new BadRequestException(firstError.message);

    const latestByOrganization = new Map<string, SubscriptionRow>();
    for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
      if (!latestByOrganization.has(subscription.organization_id)) {
        latestByOrganization.set(subscription.organization_id, subscription);
      }
    }

    const query = input.query.trim().toLowerCase();
    const normalizedStatus = ['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING', 'CLOSED'].includes(input.status)
      ? input.status
      : 'ALL';

    return (organizations ?? [])
      .map((organization) => {
        const subscription = latestByOrganization.get(organization.id) ?? null;
        return { ...organization, subscription, ...this.attentionFor(organization.status, subscription) };
      })
      .filter((organization) => normalizedStatus === 'ALL' || organization.status === normalizedStatus)
      .filter((organization) => !input.attentionOnly || organization.needsAttention)
      .filter((organization) => {
        if (!query) return true;
        return [organization.name, organization.email, organization.phone, organization.state]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });
  }

  async organizationDetail(organizationId: string) {
    const [
      { data: organization, error: organizationError },
      { data: members, error: membersError },
      { data: subscriptions, error: subscriptionsError },
      { data: printers, error: printersError },
      { data: staff, error: staffError },
      { data: invoices, error: invoicesError },
      { data: transactions, error: transactionsError },
      { data: audit, error: auditError }
    ] = await Promise.all([
      this.supabase.admin.from('organizations').select('*').eq('id', organizationId).maybeSingle(),
      this.supabase.admin.from('organization_members').select('id, user_id, role, active, created_at, updated_at').eq('organization_id', organizationId).order('created_at'),
      this.supabase.admin.from('subscriptions').select('id, plan_id, status, starts_at, ends_at, grace_ends_at, approved_at, admin_message, provider, provider_subscription_id, provider_status, billing_cycle, cancel_at_period_end, last_payment_at, next_charge_at, created_at, updated_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20),
      this.supabase.admin.from('printer_assets').select('id, asset_tag, serial_number, printer_type, ownership, security_deposit, deposit_status, issued_at, returned_at, return_condition, active, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      this.supabase.admin.from('staff_profiles').select('user_id, full_name, email, phone, last_login_at, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      this.supabase.admin.from('invoices').select('id, invoice_number, status, payment_status, payment_method, grand_total, amount_paid, amount_due, invoice_date, created_by_role').eq('organization_id', organizationId).order('invoice_date', { ascending: false }).limit(20),
      this.supabase.admin.from('payment_transactions').select('id, provider, provider_payment_id, amount, currency, status, method, captured_at, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20),
      this.supabase.admin.from('audit_logs').select('id, actor_role, action, entity_type, entity_id, summary, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50)
    ]);

    const firstError = organizationError ?? membersError ?? subscriptionsError ?? printersError ?? staffError ?? invoicesError ?? transactionsError ?? auditError;
    if (firstError) throw new BadRequestException(firstError.message);
    if (!organization) throw new NotFoundException('Organization not found');

    const currentSubscription = (subscriptions?.[0] as SubscriptionRow | undefined) ?? null;
    return {
      organization,
      currentSubscription,
      attention: this.attentionFor(organization.status, currentSubscription),
      members: members ?? [],
      staff: staff ?? [],
      subscriptions: subscriptions ?? [],
      printers: printers ?? [],
      invoices: invoices ?? [],
      transactions: transactions ?? [],
      audit: audit ?? []
    };
  }

  async suspendOrganization(organizationId: string, adminUserId: string, input: unknown) {
    const parsed = suspendSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Reason is required');

    const subscription = await this.latestSubscription(organizationId);
    const { data: organization, error: organizationError } = await this.supabase.admin
      .from('organizations')
      .select('id, status, name')
      .eq('id', organizationId)
      .maybeSingle();
    if (organizationError) throw new BadRequestException(organizationError.message);
    if (!organization) throw new NotFoundException('Organization not found');

    const { error: orgUpdateError } = await this.supabase.admin
      .from('organizations')
      .update({ status: 'SUSPENDED' })
      .eq('id', organizationId);
    if (orgUpdateError) throw new BadRequestException(orgUpdateError.message);

    if (subscription) {
      const { error: subscriptionError } = await this.supabase.admin
        .from('subscriptions')
        .update({ status: 'SUSPENDED', admin_message: parsed.data.reason })
        .eq('id', subscription.id);
      if (subscriptionError) throw new BadRequestException(subscriptionError.message);
    }

    await this.writeAudit(organizationId, adminUserId, 'ORGANIZATION_SUSPENDED', 'ORGANIZATION', organizationId, {
      reason: parsed.data.reason,
      previous_organization_status: organization.status,
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
    const { error: organizationError } = await this.supabase.admin
      .from('organizations')
      .update({ status: 'ACTIVE' })
      .eq('id', organizationId);
    if (organizationError) throw new BadRequestException(organizationError.message);

    const update: Record<string, unknown> = { status: restoredStatus };
    if (parsed.data.note) update.admin_message = parsed.data.note;
    const { error: subscriptionError } = await this.supabase.admin
      .from('subscriptions')
      .update(update)
      .eq('id', subscription.id);
    if (subscriptionError) throw new BadRequestException(subscriptionError.message);

    await this.writeAudit(organizationId, adminUserId, 'ORGANIZATION_ACCESS_RESTORED', 'ORGANIZATION', organizationId, {
      restored_subscription_status: restoredStatus,
      note: parsed.data.note || null
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
    const base = Math.max(now, Number.isFinite(currentEnd) ? currentEnd : now);
    const newEndsAt = new Date(base + parsed.data.days * 24 * 60 * 60 * 1000).toISOString();
    const restoredStatus = subscription.plan_id ? 'ACTIVE' : 'TRIAL';

    const subscriptionUpdate: Record<string, unknown> = {
      ends_at: newEndsAt,
      grace_ends_at: null,
      status: restoredStatus
    };
    if (parsed.data.message !== undefined) subscriptionUpdate.admin_message = parsed.data.message;

    const [{ error: subscriptionError }, { error: organizationError }] = await Promise.all([
      this.supabase.admin.from('subscriptions').update(subscriptionUpdate).eq('id', subscription.id),
      this.supabase.admin.from('organizations').update({ status: 'ACTIVE' }).eq('id', organizationId)
    ]);
    if (subscriptionError) throw new BadRequestException(subscriptionError.message);
    if (organizationError) throw new BadRequestException(organizationError.message);

    await this.writeAudit(organizationId, adminUserId, 'SUBSCRIPTION_ACCESS_EXTENDED', 'SUBSCRIPTION', subscription.id, {
      added_days: parsed.data.days,
      previous_ends_at: subscription.ends_at,
      new_ends_at: newEndsAt,
      status: restoredStatus,
      message: parsed.data.message ?? null
    });

    return { extended: true, endsAt: newEndsAt, subscriptionStatus: restoredStatus };
  }

  async updateAdminMessage(organizationId: string, adminUserId: string, input: unknown) {
    const parsed = messageSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid message');

    const subscription = await this.latestSubscription(organizationId);
    if (!subscription) throw new BadRequestException('No subscription exists for this organization');

    const { error } = await this.supabase.admin
      .from('subscriptions')
      .update({ admin_message: parsed.data.message || null })
      .eq('id', subscription.id);
    if (error) throw new BadRequestException(error.message);

    await this.writeAudit(organizationId, adminUserId, 'ADMIN_MESSAGE_UPDATED', 'SUBSCRIPTION', subscription.id, {
      message: parsed.data.message || null
    });

    return { updated: true };
  }

  async auditTrail(input: AuditInput) {
    const limit = Number.isFinite(input.limit) ? Math.min(Math.max(Math.trunc(input.limit), 1), 250) : 100;
    let request = this.supabase.admin
      .from('audit_logs')
      .select('id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, request_id, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (input.organizationId && z.string().uuid().safeParse(input.organizationId).success) {
      request = request.eq('organization_id', input.organizationId);
    }

    const { data, error } = await request;
    if (error) throw new BadRequestException(error.message);

    const query = input.query.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      if (!query) return true;
      return [row.action, row.actor_role, row.entity_type, JSON.stringify(row.summary ?? {})]
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }
}
