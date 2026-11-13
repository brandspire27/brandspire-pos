'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { localizedStatus, posText } from '@/lib/pos-i18n';
import { listInvoices } from '@/lib/pos-api';

type Invoice = {
  id: string; invoice_number: string; grand_total: number; amount_paid: number; amount_due: number;
  payment_status: string; status: string; payment_method: string | null; created_at: string;
  customer_name?: string | null;
};

export default function InvoicesPage() {
  const router = useRouter();
  const [org, setOrg] = useState<CurrentOrganization | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    getCurrentOrganization().then(async current => {
      if (!current) return router.replace('/auth/login');
      if (current.role !== 'OWNER') return router.replace('/staff');
      setOrg(current);
      try {
        const response = await listInvoices({ limit: 200 });
        setInvoices(response.data as unknown as Invoice[]);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not load invoices.');
      }
    });
  }, [router]);
  if (!org) return <WorkspaceLoader />;
  const t = posText(org.preferredLanguage);
  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.invoicesKicker}</span><h1>{t.invoicesTitle}</h1><p>{t.invoicesSub}</p></div><button className="btn btn-primary" onClick={() => router.push('/owner/billing')}>+ {t.createBill}</button></div>
    {error && <div className="form-error">{error}</div>}
    <section className="card pos-panel"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t.invoiceKicker}</th><th>{t.customer}</th><th>{t.payment}</th><th>{t.total}</th><th>{t.due}</th><th></th></tr></thead><tbody>
      {invoices.length === 0 ? <tr><td colSpan={6}><div className="empty-state">{t.noBills}</div></td></tr> : invoices.map(invoice => <tr key={invoice.id}>
        <td><strong>{invoice.invoice_number}</strong><small>{formatDateTime(invoice.created_at)}</small></td>
        <td>{invoice.customer_name || t.walkInCustomer}</td>
        <td><span className={`mini-status mini-${invoice.payment_status.toLowerCase()}`}>{localizedStatus(org.preferredLanguage, invoice.payment_status)}</span><small>{invoice.payment_method || '—'}</small></td>
        <td><strong>{formatINR(invoice.grand_total)}</strong></td><td><strong>{formatINR(invoice.amount_due)}</strong></td>
        <td><button className="btn" onClick={() => router.push(`/owner/invoice?id=${invoice.id}`)}>{t.viewPrint}</button></td>
      </tr>)}
    </tbody></table></div></section>
  </OwnerShell>;
}
