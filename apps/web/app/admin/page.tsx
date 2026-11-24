'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { adminDate, adminMoney, adminRequest } from '@/lib/admin-api';
import { installationPackageName, installationPrinterType } from '@/lib/installation-api';

type Application = {
  id: string;
  email: string;
  owner_name: string;
  business_name: string;
  phone: string;
  business_type: string | null;
  gstin: string | null;
  state: string | null;
  address: string | null;
  preferred_language: string;
  status: string;
  created_at: string;
  installation_package_code: string | null;
  installation_amount: number | null;
  installation_payment_method: 'CASHFREE' | 'CASH_ON_INSTALLATION' | null;
  installation_payment_status: 'CREATED' | 'DUE' | 'PAID' | 'COLLECTED' | 'CLOSED' | null;
  installation_order_id: string | null;
  installation_paid_at: string | null;
  installation_collected_at: string | null;
};

type Subscription = {
  status: string;
  ends_at: string | null;
  provider: string | null;
};

type Tenant = {
  id: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  subscription: Subscription | null;
  needsAttention: boolean;
  reason: string | null;
};

type AuditRow = {
  id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  created_at: string;
};

type DashboardData = {
  metrics: {
    totalOrganizations: number;
    activeOrganizations: number;
    suspendedOrganizations: number;
    trialSubscriptions: number;
    activeSubscriptions: number;
    expiringSoon: number;
    attentionRequired: number;
    pendingApplications: number;
    failedWebhooks7d: number;
    capturedSubscriptionRevenue30d: number;
  };
  attention: Tenant[];
  recentOrganizations: Tenant[];
  recentAudit: AuditRow[];
};

type ApprovalDraft = {
  accessMode: 'TRIAL' | 'SUBSCRIPTION';
  duration: number;
  printerType: '' | 'THERMAL_58MM' | 'THERMAL_80MM' | 'A4';
  securityDeposit: number;
};

const defaultDraft: ApprovalDraft = { accessMode: 'TRIAL', duration: 3, printerType: '', securityDeposit: 0 };

function statusClass(value: string) {
  const normalized = value.toLowerCase();
  if (['active', 'paid', 'processed'].includes(normalized)) return 'admin-status admin-status-good';
  if (['trial', 'pending', 'grace_period'].includes(normalized)) return 'admin-status admin-status-warn';
  if (['suspended', 'expired', 'past_due', 'failed', 'cancelled'].includes(normalized)) return 'admin-status admin-status-bad';
  return 'admin-status';
}

function defaultDraftFor(application: Application): ApprovalDraft {
  return {
    ...defaultDraft,
    printerType: installationPrinterType(application.installation_package_code)
  };
}

export default function AdminPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [installationDues, setInstallationDues] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ApprovalDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboardResponse, applicationResponse, installationDueResponse] = await Promise.all([
        adminRequest<{ success: true; data: DashboardData }>('/dashboard'),
        adminRequest<{ success: true; data: Application[] }>('/applications?status=PENDING'),
        adminRequest<{ success: true; data: Application[] }>('/applications?status=INSTALLATION_DUE')
      ]);
      setDashboard(dashboardResponse.data);
      setApplications(applicationResponse.data ?? []);
      setInstallationDues(installationDueResponse.data ?? []);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not load Brandspire Admin dashboard';
      if (message === 'ADMIN_SESSION_EXPIRED') router.push('/auth/login');
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function updateDraft(application: Application, updates: Partial<ApprovalDraft>) {
    setDrafts((current) => ({
      ...current,
      [application.id]: { ...(current[application.id] ?? defaultDraftFor(application)), ...updates }
    }));
  }

  async function approve(application: Application) {
    setWorkingId(application.id);
    setError('');
    const draft = drafts[application.id] ?? defaultDraftFor(application);
    try {
      await adminRequest(`/applications/${application.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          accessMode: draft.accessMode,
          ...(draft.accessMode === 'TRIAL' ? { durationDays: draft.duration } : { durationMonths: draft.duration }),
          printerType: draft.printerType || null,
          securityDeposit: Number(draft.securityDeposit || 0),
          adminMessage: draft.accessMode === 'TRIAL'
            ? `Welcome to Brandspire POS! Your ${draft.duration}-day free trial is now live.`
            : `Your Brandspire POS subscription is active for ${draft.duration} month${draft.duration > 1 ? 's' : ''}.`
        })
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Approval failed');
    } finally {
      setWorkingId('');
    }
  }

  async function reject(application: Application) {
    const note = window.prompt('Reason for rejection (shown to the Owner):', 'Please contact the Brandspire Team to complete verification.');
    if (note === null) return;
    setWorkingId(application.id);
    setError('');
    try {
      await adminRequest(`/applications/${application.id}/reject`, { method: 'POST', body: JSON.stringify({ note }) });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Rejection failed');
    } finally {
      setWorkingId('');
    }
  }

  async function markInstallationCollected(application: Application) {
    setWorkingId(application.id);
    setError('');
    try {
      await adminRequest(`/applications/${application.id}/installation/collect`, { method: 'POST' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cash collection could not be recorded');
    } finally {
      setWorkingId('');
    }
  }

  async function logout() {
    await signOut(getFirebaseAuth());
    router.push('/auth/login');
  }

  if (loading) return <main className="admin-loading"><div className="admin-loading-card">Loading Brandspire Admin Control Center…</div></main>;

  const metrics = dashboard?.metrics;

  return (
    <main className="admin-shell">
      <aside className="admin-nav">
        <div className="admin-brand"><b>Brandspire POS</b><span>Platform Control Center</span></div>
        <nav>
          <Link className="active" href="/admin">Overview</Link>
          <Link href="/admin/organizations">Organizations</Link>
          <a href="#applications">Owner Applications</a>
          <Link href="/admin/billing">Cashfree Billing</Link>
          <Link href="/admin/audit">Audit Trail</Link>
        </nav>
        <button className="admin-logout" onClick={logout}>Sign out</button>
      </aside>

      <section className="admin-content">
        <header className="admin-page-head">
          <div><span>BRANDSPIRE PLATFORM</span><h1>Admin Control Center</h1><p>Monitor tenants, access, billing health and operational risk from one place.</p></div>
          <button className="btn btn-secondary" onClick={() => void load()}>Refresh</button>
        </header>

        {error && <div className="form-error admin-error">{error}</div>}

        <div className="admin-metric-grid">
          <article><span>Total businesses</span><strong>{metrics?.totalOrganizations ?? 0}</strong><small>{metrics?.activeOrganizations ?? 0} active</small></article>
          <article><span>Needs attention</span><strong>{metrics?.attentionRequired ?? 0}</strong><small>{metrics?.expiringSoon ?? 0} expiring soon</small></article>
          <article><span>Pending approvals</span><strong>{metrics?.pendingApplications ?? 0}</strong><small>Owner applications</small></article>
          <article><span>Cashfree revenue · 30d</span><strong>{adminMoney(metrics?.capturedSubscriptionRevenue30d ?? 0)}</strong><small>{metrics?.failedWebhooks7d ?? 0} failed webhooks · 7d</small></article>
        </div>

        <div className="admin-two-column">
          <section className="admin-panel">
            <div className="admin-panel-head"><div><span>ATTENTION QUEUE</span><h2>Businesses needing action</h2></div><Link href="/admin/organizations?attention=true">View all</Link></div>
            <div className="admin-list">
              {(dashboard?.attention ?? []).length === 0 ? <div className="admin-empty">No urgent tenant issues right now.</div> : dashboard?.attention.map((tenant) => (
                <Link className="admin-list-row" href={`/admin/organization?id=${tenant.id}`} key={tenant.id}>
                  <div><strong>{tenant.name}</strong><small>{tenant.reason?.replaceAll('_', ' ') ?? 'Attention required'}</small></div>
                  <div className="admin-row-right"><span className={statusClass(tenant.subscription?.status ?? tenant.status)}>{tenant.subscription?.status ?? tenant.status}</span><small>{tenant.subscription?.ends_at ? adminDate(tenant.subscription.ends_at) : 'No end date'}</small></div>
                </Link>
              ))}
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head"><div><span>ACTIVITY</span><h2>Recent audit events</h2></div><Link href="/admin/audit">Full audit</Link></div>
            <div className="admin-list">
              {(dashboard?.recentAudit ?? []).length === 0 ? <div className="admin-empty">No audit events yet.</div> : dashboard?.recentAudit.map((row) => (
                <div className="admin-list-row" key={row.id}>
                  <div><strong>{row.action.replaceAll('_', ' ')}</strong><small>{row.actor_role} · {row.entity_type}</small></div>
                  <div className="admin-row-right"><small>{adminDate(row.created_at)}</small></div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="admin-panel" id="applications">
          <div className="admin-panel-head"><div><span>OWNER ONBOARDING</span><h2>Pending applications</h2></div><b>{applications.length}</b></div>
          {applications.length === 0 ? <div className="admin-empty">No pending owner applications.</div> : (
            <div className="admin-application-grid">
              {applications.map((application) => {
                const draft = drafts[application.id] ?? defaultDraftFor(application);
                return (
                  <article className="admin-application-card" key={application.id}>
                    <div className="admin-application-title"><div><h3>{application.business_name}</h3><p>{application.owner_name} · {application.email}</p></div><span className="admin-status admin-status-warn">PENDING</span></div>
                    <div className="admin-application-meta">
                      <div><b>Phone</b><span>{application.phone}</span></div><div><b>State</b><span>{application.state || '—'}</span></div>
                      <div><b>Type</b><span>{application.business_type || '—'}</span></div><div><b>GSTIN</b><span>{application.gstin || 'Not provided'}</span></div>
                      <div><b>Language</b><span>{application.preferred_language || 'en'}</span></div><div><b>Applied</b><span>{adminDate(application.created_at)}</span></div>
                      {application.installation_package_code && <div><b>Printer package</b><span>{installationPackageName(application.installation_package_code)}</span></div>}
                      {application.installation_amount != null && <div><b>Installation charge</b><span>{adminMoney(application.installation_amount)}</span></div>}
                      {application.installation_payment_method && <div><b>Payment method / status</b><span>{application.installation_payment_method === 'CASHFREE' ? 'Cashfree' : 'Cash on installation'} · {application.installation_payment_status ?? 'Not paid'}</span></div>}
                    </div>
                    <div className="admin-approval-controls">
                      <label>Access<select value={draft.accessMode} onChange={(event) => updateDraft(application, { accessMode: event.target.value as ApprovalDraft['accessMode'], duration: event.target.value === 'TRIAL' ? 3 : 1 })}><option value="TRIAL">Free Trial</option><option value="SUBSCRIPTION">Paid Subscription</option></select></label>
                      <label>{draft.accessMode === 'TRIAL' ? 'Trial days' : 'Months'}<select value={draft.duration} onChange={(event) => updateDraft(application, { duration: Number(event.target.value) })}>{draft.accessMode === 'TRIAL' ? <><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option></> : <><option value={1}>1 month</option><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option></>}</select></label>
                      <label>Printer<select value={draft.printerType} disabled={Boolean(application.installation_package_code)} onChange={(event) => updateDraft(application, { printerType: event.target.value as ApprovalDraft['printerType'] })}><option value="">No printer</option><option value="THERMAL_58MM">58mm</option><option value="THERMAL_80MM">80mm</option><option value="A4">A4</option></select></label>
                      <label>Deposit ₹<input min="0" type="number" value={draft.securityDeposit} onChange={(event) => updateDraft(application, { securityDeposit: Number(event.target.value) })} /></label>
                    </div>
                    {application.installation_payment_method === 'CASHFREE' && application.installation_payment_status !== 'PAID' && <p className="admin-help">Approve is disabled until Cashfree confirms the installation charge.</p>}
                    <div className="admin-application-actions">
                      <button className="btn btn-danger" title={application.installation_payment_method === 'CASHFREE' && application.installation_payment_status === 'CREATED' ? 'Payment status will be checked before rejection.' : undefined} disabled={workingId === application.id || application.installation_payment_status === 'PAID' || application.installation_payment_status === 'COLLECTED'} onClick={() => void reject(application)}>Reject</button>
                      <button className="btn btn-primary" disabled={workingId === application.id || (application.installation_payment_method === 'CASHFREE' && application.installation_payment_status !== 'PAID')} onClick={() => void approve(application)}>{workingId === application.id ? 'Working…' : 'Approve & Activate'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head"><div><span>INSTALLATION COLLECTIONS</span><h2>Cash to collect</h2></div><b>{installationDues.length}</b></div>
          {installationDues.length === 0 ? <div className="admin-empty">No cash-on-installation charges are due.</div> : (
            <div className="admin-application-grid">
              {installationDues.map(application => (
                <article className="admin-application-card" key={application.id}>
                  <div className="admin-application-title">
                    <div><h3>{application.business_name}</h3><p>{application.owner_name} · {application.phone} · {application.status}</p></div>
                    <span className="admin-status admin-status-warn">CASH DUE</span>
                  </div>
                  <div className="admin-application-meta">
                    <div><b>Printer package</b><span>{installationPackageName(application.installation_package_code)}</span></div>
                    <div><b>Amount due</b><span>{adminMoney(application.installation_amount ?? 0)}</span></div>
                    <div><b>Applied</b><span>{adminDate(application.created_at)}</span></div>
                  </div>
                  <div className="admin-application-actions">
                    <button className="btn btn-primary" disabled={workingId === application.id} onClick={() => void markInstallationCollected(application)}>
                      {workingId === application.id ? 'Saving…' : 'Mark cash collected'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
