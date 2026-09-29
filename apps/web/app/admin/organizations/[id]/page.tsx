'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminDate, adminMoney, adminRequest } from '@/lib/admin-api';

type Detail = {
  organization: Record<string, unknown> & { id: string; name: string; status: string; email?: string | null; phone?: string | null; state?: string | null; gstin?: string | null; address?: string | null; preferred_language?: string | null };
  currentSubscription: null | { id: string; status: string; plan_id: string | null; starts_at: string | null; ends_at: string | null; provider: string | null; provider_status: string | null; billing_cycle: string | null; admin_message: string | null; next_charge_at: string | null };
  attention: { needsAttention: boolean; reason: string | null };
  members: Array<{ id: string; role: string; active: boolean; created_at: string }>;
  staff: Array<{ user_id: string; full_name: string; email: string; phone: string | null; last_login_at: string | null }>;
  subscriptions: Array<{ id: string; status: string; starts_at: string | null; ends_at: string | null; provider: string | null; provider_status: string | null; billing_cycle: string | null; created_at: string }>;
  printers: Array<{ id: string; printer_type: string; asset_tag: string | null; serial_number: string | null; security_deposit: number; deposit_status: string; active: boolean }>;
  invoices: Array<{ id: string; invoice_number: string; payment_status: string; grand_total: number; amount_due: number; invoice_date: string; created_by_role: string }>;
  transactions: Array<{ id: string; provider: string; provider_payment_id: string | null; amount: number; currency: string; status: string; method: string | null; created_at: string }>;
  audit: Array<{ id: string; actor_role: string; action: string; entity_type: string; summary: Record<string, unknown>; created_at: string }>;
};

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await adminRequest<{ success: true; data: Detail }>(`/organizations/${id}`);
      setData(response.data);
      setMessage(response.data.currentSubscription?.admin_message ?? '');
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : 'Could not load organization';
      if (text === 'ADMIN_SESSION_EXPIRED') router.push('/auth/login'); else setError(text);
    } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  const invoiceTotal = useMemo(() => data?.invoices.reduce((sum, invoice) => sum + Number(invoice.grand_total || 0), 0) ?? 0, [data]);
  const invoiceDue = useMemo(() => data?.invoices.reduce((sum, invoice) => sum + Number(invoice.amount_due || 0), 0) ?? 0, [data]);

  async function action(path: string, body: Record<string, unknown>, label: string) {
    setWorking(label); setError('');
    try { await adminRequest(`/organizations/${id}/${path}`, { method: 'POST', body: JSON.stringify(body) }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${label} failed`); }
    finally { setWorking(''); }
  }

  function suspend() {
    const reason = window.prompt('Reason shown to the Owner:', 'Brandspire POS access has been temporarily suspended. Please contact the Brandspire Team.');
    if (reason) void action('suspend', { reason }, 'suspend');
  }

  function restore() {
    const note = window.prompt('Optional message shown to the Owner:', 'Brandspire POS access has been restored.');
    if (note !== null) void action('restore', { note }, 'restore');
  }

  function extend(days: number) {
    if (window.confirm(`Extend access by ${days} day${days === 1 ? '' : 's'}?`)) void action('extend', { days }, `extend-${days}`);
  }

  if (loading) return <main className="admin-loading"><div className="admin-loading-card">Loading organization…</div></main>;
  if (!data) return <main className="admin-page-standalone"><div className="form-error">{error || 'Organization not found'}</div></main>;

  const organization = data.organization;
  const subscription = data.currentSubscription;

  return <main className="admin-page-standalone">
    <header className="admin-page-head"><div><span>TENANT CONTROL</span><h1>{organization.name}</h1><p>{organization.email || 'No email'} · {organization.phone || 'No phone'} · {organization.state || 'No state'}</p></div><div className="admin-head-actions"><Link className="btn btn-secondary" href="/admin/organizations">← Organizations</Link><button className="btn btn-secondary" onClick={() => void load()}>Refresh</button></div></header>
    {error && <div className="form-error admin-error">{error}</div>}

    <div className="admin-metric-grid">
      <article><span>Platform status</span><strong>{organization.status}</strong><small>{data.attention.needsAttention ? data.attention.reason?.replaceAll('_', ' ') : 'Healthy'}</small></article>
      <article><span>Subscription</span><strong>{subscription?.status ?? 'NONE'}</strong><small>{subscription?.provider ?? 'Manual'} · {subscription?.billing_cycle ?? '—'}</small></article>
      <article><span>Access ends</span><strong className="admin-date-strong">{subscription?.ends_at ? adminDate(subscription.ends_at) : 'No date'}</strong><small>Next charge: {adminDate(subscription?.next_charge_at)}</small></article>
      <article><span>Recent invoices</span><strong>{adminMoney(invoiceTotal)}</strong><small>{adminMoney(invoiceDue)} due · last {data.invoices.length} bills</small></article>
    </div>

    <section className="admin-panel admin-danger-zone">
      <div className="admin-panel-head"><div><span>ACCESS CONTROL</span><h2>Brandspire Admin actions</h2></div></div>
      <div className="admin-action-strip"><button className="btn btn-secondary" disabled={!!working} onClick={() => extend(3)}>+3 days</button><button className="btn btn-secondary" disabled={!!working} onClick={() => extend(30)}>+30 days</button><button className="btn btn-secondary" disabled={!!working} onClick={() => extend(365)}>+365 days</button>{organization.status === 'SUSPENDED' ? <button className="btn btn-primary" disabled={!!working} onClick={restore}>Restore access</button> : <button className="btn btn-danger" disabled={!!working} onClick={suspend}>Suspend access</button>}</div>
      <p className="admin-help">Every action is written to the audit trail. Restoring an expired tenant is blocked until its access period is extended.</p>
    </section>

    <div className="admin-two-column">
      <section className="admin-panel"><div className="admin-panel-head"><div><span>OWNER COMMUNICATION</span><h2>Admin message</h2></div></div><textarea className="admin-message" maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message visible to the Owner…" /><div className="admin-inline-actions"><span>{message.length}/500</span><button className="btn btn-primary" disabled={!!working} onClick={() => void action('message', { message }, 'message')}>Save message</button></div></section>
      <section className="admin-panel"><div className="admin-panel-head"><div><span>BUSINESS PROFILE</span><h2>Tenant details</h2></div></div><div className="admin-detail-grid"><div><b>GSTIN</b><span>{organization.gstin || '—'}</span></div><div><b>Language</b><span>{organization.preferred_language || 'en'}</span></div><div><b>State</b><span>{organization.state || '—'}</span></div><div><b>Staff</b><span>{data.staff.length}</span></div><div className="admin-wide"><b>Address</b><span>{organization.address || '—'}</span></div></div></section>
    </div>

    <div className="admin-two-column">
      <section className="admin-panel"><div className="admin-panel-head"><div><span>STAFF</span><h2>Team access</h2></div><b>{data.staff.length}</b></div><div className="admin-list">{data.staff.length === 0 ? <div className="admin-empty">No staff accounts.</div> : data.staff.map((staff) => <div className="admin-list-row" key={staff.user_id}><div><strong>{staff.full_name}</strong><small>{staff.email}{staff.phone ? ` · ${staff.phone}` : ''}</small></div><div className="admin-row-right"><small>Last login</small><strong>{adminDate(staff.last_login_at)}</strong></div></div>)}</div></section>
      <section className="admin-panel"><div className="admin-panel-head"><div><span>PRINTER ASSETS</span><h2>Assigned hardware</h2></div><b>{data.printers.length}</b></div><div className="admin-list">{data.printers.length === 0 ? <div className="admin-empty">No Brandspire printer assigned.</div> : data.printers.map((printer) => <div className="admin-list-row" key={printer.id}><div><strong>{printer.printer_type}</strong><small>{printer.asset_tag || printer.serial_number || 'No asset tag'}</small></div><div className="admin-row-right"><strong>{printer.deposit_status}</strong><small>{adminMoney(printer.security_deposit)} deposit</small></div></div>)}</div></section>
    </div>

    <section className="admin-panel"><div className="admin-panel-head"><div><span>BILLING HISTORY</span><h2>Recent merchant invoices</h2></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Invoice</th><th>Date</th><th>Created by</th><th>Total</th><th>Due</th><th>Payment</th></tr></thead><tbody>{data.invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoice_number}</strong></td><td>{adminDate(invoice.invoice_date)}</td><td>{invoice.created_by_role}</td><td>{adminMoney(invoice.grand_total)}</td><td>{adminMoney(invoice.amount_due)}</td><td>{invoice.payment_status}</td></tr>)}</tbody></table>{data.invoices.length === 0 && <div className="admin-empty">No invoices yet.</div>}</div></section>

    <section className="admin-panel"><div className="admin-panel-head"><div><span>AUDIT</span><h2>Recent tenant activity</h2></div><Link href={`/admin/audit?organizationId=${id}`}>Open full audit</Link></div><div className="admin-list">{data.audit.slice(0, 15).map((row) => <div className="admin-list-row" key={row.id}><div><strong>{row.action.replaceAll('_', ' ')}</strong><small>{row.actor_role} · {row.entity_type}</small></div><div className="admin-row-right"><small>{adminDate(row.created_at)}</small></div></div>)}</div></section>
  </main>;
}
