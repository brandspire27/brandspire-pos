'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminDate, adminRequest } from '@/lib/admin-api';

type Tenant = {
  id: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  created_at: string;
  subscription: { status: string; ends_at: string | null; provider: string | null; billing_cycle: string | null } | null;
  needsAttention: boolean;
  reason: string | null;
};

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Tenant[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [attentionOnly, setAttentionOnly] = useState(searchParams.get('attention') === 'true');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ q: query, status, attention: String(attentionOnly) });
      const response = await adminRequest<{ success: true; data: Tenant[] }>(`/organizations?${params.toString()}`);
      setRows(response.data ?? []);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not load organizations';
      if (message === 'ADMIN_SESSION_EXPIRED') router.push('/auth/login'); else setError(message);
    } finally { setLoading(false); }
  }, [attentionOnly, query, router, status]);

  useEffect(() => { const handle = setTimeout(() => void load(), 180); return () => clearTimeout(handle); }, [load]);

  return <main className="admin-page-standalone">
    <header className="admin-page-head"><div><span>PLATFORM TENANTS</span><h1>Organizations</h1><p>Search every Brandspire POS business and inspect its access state.</p></div><Link className="btn btn-secondary" href="/admin">← Control Center</Link></header>
    <div className="admin-toolbar"><input placeholder="Search business, email, phone or state…" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="PENDING">Pending</option><option value="CLOSED">Closed</option></select><label className="admin-check"><input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} /> Needs attention only</label></div>
    {error && <div className="form-error admin-error">{error}</div>}
    <section className="admin-panel">
      {loading ? <div className="admin-empty">Loading organizations…</div> : rows.length === 0 ? <div className="admin-empty">No organizations match these filters.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Business</th><th>Platform</th><th>Subscription</th><th>Access ends</th><th>Attention</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.email || row.phone || row.state || '—'}</small></td><td><span className={`admin-status ${row.status === 'ACTIVE' ? 'admin-status-good' : row.status === 'SUSPENDED' ? 'admin-status-bad' : ''}`}>{row.status}</span></td><td><strong>{row.subscription?.status ?? 'NONE'}</strong><small>{row.subscription?.provider ?? 'Manual access'}</small></td><td>{adminDate(row.subscription?.ends_at)}</td><td>{row.needsAttention ? <span className="admin-attention">{row.reason?.replaceAll('_', ' ')}</span> : <span className="admin-ok">Healthy</span>}</td><td><Link className="admin-open" href={`/admin/organizations/${row.id}`}>Open →</Link></td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
