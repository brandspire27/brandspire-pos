'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminDate, adminRequest } from '@/lib/admin-api';

type AuditRow = { id: string; organization_id: string | null; actor_role: string; action: string; entity_type: string; entity_id: string | null; summary: Record<string, unknown>; created_at: string };

export default function AdminAuditPage() {
  const router = useRouter(); const searchParams = useSearchParams();
  const organizationId = searchParams.get('organizationId') ?? '';
  const [query, setQuery] = useState(''); const [rows, setRows] = useState<AuditRow[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const params = new URLSearchParams({ q: query, organizationId, limit: '150' }); const response = await adminRequest<{success:true;data:AuditRow[]}>(`/audit?${params.toString()}`); setRows(response.data ?? []); } catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not load audit trail'; if (message === 'ADMIN_SESSION_EXPIRED') router.push('/auth/login'); else setError(message); } finally { setLoading(false); } }, [organizationId, query, router]);
  useEffect(() => { const handle = setTimeout(() => void load(), 180); return () => clearTimeout(handle); }, [load]);
  return <main className="admin-page-standalone"><header className="admin-page-head"><div><span>SECURITY & SUPPORT</span><h1>Audit Trail</h1><p>Trace platform and tenant actions without editing business records.</p></div><Link className="btn btn-secondary" href={organizationId ? `/admin/organizations/${organizationId}` : '/admin'}>← Back</Link></header><div className="admin-toolbar"><input placeholder="Search action, role, entity or summary…" value={query} onChange={(event) => setQuery(event.target.value)} />{organizationId && <span className="admin-filter-chip">Tenant filtered</span>}</div>{error && <div className="form-error admin-error">{error}</div>}<section className="admin-panel">{loading ? <div className="admin-empty">Loading audit events…</div> : rows.length === 0 ? <div className="admin-empty">No matching audit events.</div> : <div className="admin-list">{rows.map((row) => <div className="admin-audit-row" key={row.id}><div><strong>{row.action.replaceAll('_', ' ')}</strong><small>{row.actor_role} · {row.entity_type}{row.organization_id ? ` · ${row.organization_id.slice(0, 8)}` : ''}</small><code>{JSON.stringify(row.summary ?? {})}</code></div><time>{adminDate(row.created_at)}</time></div>)}</div>}</section></main>;
}
