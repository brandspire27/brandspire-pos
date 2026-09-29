'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { adminDate, adminMoney, adminRequest } from '@/lib/admin-api';

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

export default function AdminPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ApprovalDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboardResponse, applicationResponse] = await Promise.all([
        adminRequest<{ success: true; data: DashboardData }>('/dashboard'),
        adminRequest<{ success: true; data: Application[] }>('/applications?status=PENDING')
      ]);
      setDashboard(dashboardResponse.data);
      setApplications(applicationResponse.data ?? []);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not load Brandspire Admin dashboard';
      if (message === 'ADMIN_SESSION_EXPIRED') router.push('/auth/login');
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function updateDraft(id: string, updates: Partial<ApprovalDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? defaultDraft), ...updates } }));
  }

  async function approve(application: Application) {
    setWorkingId(application.id);
    setError('');
    const draft = drafts[application.id] ?? defaultDraft;
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

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
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
                <Link className="admin-list-row" href={`/admin/organizations/${tenant.id}`} key={tenant.id}>
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
                const draft = drafts[application.id] ?? defaultDraft;
                return (
                  <article className="admin-application-card" key={application.id}>
                    <div className="admin-application-title"><div><h3>{application.business_name}</h3><p>{application.owner_name} · {application.email}</p></div><span className="admin-status admin-status-warn">PENDING</span></div>
                    <div className="admin-application-meta">
                      <div><b>Phone</b><span>{application.phone}</span></div><div><b>State</b><span>{application.state || '—'}</span></div>
                      <div><b>Type</b><span>{application.business_type || '—'}</span></div><div><b>GSTIN</b><span>{application.gstin || 'Not provided'}</span></div>
                      <div><b>Language</b><span>{application.preferred_language || 'en'}</span></div><div><b>Applied</b><span>{adminDate(application.created_at)}</span></div>
                    </div>
                    <div className="admin-approval-controls">
                      <label>Access<select value={draft.accessMode} onChange={(event) => updateDraft(application.id, { accessMode: event.target.value as ApprovalDraft['accessMode'], duration: event.target.value === 'TRIAL' ? 3 : 1 })}><option value="TRIAL">Free Trial</option><option value="SUBSCRIPTION">Paid Subscription</option></select></label>
                      <label>{draft.accessMode === 'TRIAL' ? 'Trial days' : 'Months'}<select value={draft.duration} onChange={(event) => updateDraft(application.id, { duration: Number(event.target.value) })}>{draft.accessMode === 'TRIAL' ? <><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option></> : <><option value={1}>1 month</option><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option></>}</select></label>
                      <label>Printer<select value={draft.printerType} onChange={(event) => updateDraft(application.id, { printerType: event.target.value as ApprovalDraft['printerType'] })}><option value="">No printer</option><option value="THERMAL_58MM">58mm</option><option value="THERMAL_80MM">80mm</option><option value="A4">A4</option></select></label>
                      <label>Deposit ₹<input min="0" type="number" value={draft.securityDeposit} onChange={(event) => updateDraft(application.id, { securityDeposit: Number(event.target.value) })} /></label>
                    </div>
                    <div className="admin-application-actions"><button className="btn btn-danger" disabled={workingId === application.id} onClick={() => void reject(application)}>Reject</button><button className="btn btn-primary" disabled={workingId === application.id} onClick={() => void approve(application)}>{workingId === application.id ? 'Working…' : 'Approve & Activate'}</button></div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
