'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import SubscriptionBanner from '@/components/pos/SubscriptionBanner';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatINR, getCurrentOrganization, isSubscriptionUsable, type CurrentOrganization } from '@/lib/pos';
import { localizedStatus, posText } from '@/lib/pos-i18n';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type DashboardData = {
  todaySales: number;
  todayBills: number;
  lowStock: number;
  outstanding: number;
  recentInvoices: Array<{ id: string; invoice_number: string; grand_total: number; payment_status: string; created_at: string }>;
};

export default function OwnerDashboard() {
  const router = useRouter();
  const [org, setOrg] = useState<CurrentOrganization | null>(null);
  const [data, setData] = useState<DashboardData>({ todaySales: 0, todayBills: 0, lowStock: 0, outstanding: 0, recentInvoices: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const current = await getCurrentOrganization();
        if (!current) { router.replace('/auth/login'); return; }
        if (current.role !== 'OWNER') { router.replace('/staff'); return; }
        setOrg(current);

        const supabase = getSupabaseBrowserClient();
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const [invoiceResult, lowStockResult, outstandingResult, recentResult] = await Promise.all([
          supabase.from('invoices').select('grand_total').eq('organization_id', current.organizationId).gte('created_at', start.toISOString()).neq('status', 'CANCELLED'),
          supabase.from('products').select('stock, low_stock_threshold').eq('organization_id', current.organizationId).is('deleted_at', null).eq('active', true),
          supabase.from('customers').select('outstanding_balance').eq('organization_id', current.organizationId).is('deleted_at', null),
          supabase.from('invoices').select('id, invoice_number, grand_total, payment_status, created_at').eq('organization_id', current.organizationId).order('created_at', { ascending: false }).limit(5)
        ]);

        const invoicesToday = (invoiceResult.data ?? []) as Array<{ grand_total?: number | string | null }>;
        const customerBalances = (outstandingResult.data ?? []) as Array<{ outstanding_balance?: number | string | null }>;
        const productsLowStock = (lowStockResult.data ?? []) as Array<{ stock?: number | string | null; low_stock_threshold?: number | string | null }>;
        setData({
          todaySales: invoicesToday.reduce<number>((sum, invoice) => sum + Number(invoice.grand_total ?? 0), 0),
          todayBills: invoicesToday.length,
          lowStock: productsLowStock.filter((product) => Number(product.stock ?? 0) <= Number(product.low_stock_threshold ?? 0)).length,
          outstanding: customerBalances.reduce<number>((sum, customer) => sum + Number(customer.outstanding_balance ?? 0), 0),
          recentInvoices: (recentResult.data ?? []) as DashboardData['recentInvoices']
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load dashboard.');
      } finally { setLoading(false); }
    }
    load();
  }, [router]);

  if (!org) return <WorkspaceLoader />;

  const usable = isSubscriptionUsable(org.subscriptionStatus, org.endsAt);
  const t = posText(org.preferredLanguage);

  return (
    <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
      <div className="content-head pos-page-head">
        <div><span className="page-kicker">{t.dashboard}</span><h1>{t.dashboardGreeting}</h1><p>{t.dashboardSub.replace('your business', org.organizationName)}</p></div>
        {usable && <Link className="btn btn-primary pos-primary-action" href="/owner/billing">+ {t.createBill}</Link>}
      </div>

      <SubscriptionBanner status={org.subscriptionStatus} endsAt={org.endsAt} adminMessage={org.adminMessage} language={org.preferredLanguage} />
      {error && <div className="form-error">{error}</div>}

      <div className="metric-grid">
        <article className="metric-card"><span>{t.todaySales}</span>{loading?<i className="skeleton-value"/>:<strong>{formatINR(data.todaySales)}</strong>}<small>{t.salesHint}</small></article>
        <article className="metric-card"><span>{t.todayBills}</span>{loading?<i className="skeleton-value short"/>:<strong>{data.todayBills}</strong>}<small>{t.billsHint}</small></article>
        <article className="metric-card"><span>{t.outstanding}</span>{loading?<i className="skeleton-value"/>:<strong>{formatINR(data.outstanding)}</strong>}<small>{t.duesHint}</small></article>
        <article className="metric-card"><span>{t.lowStock}</span>{loading?<i className="skeleton-value short"/>:<strong>{data.lowStock}</strong>}<small>{t.stockHint}</small></article>
      </div>

      <div className="owner-grid-2">
        <section className="card pos-panel">
          <div className="panel-head"><div><span className="page-kicker">{t.quickActions}</span><h2>{t.runCounter}</h2></div></div>
          <div className="quick-actions-grid">
            <Link className="quick-action quick-action-primary" href="/owner/billing"><b>01</b><span><strong>{t.createBill}</strong><small>{t.searchTakeFinish}</small></span></Link>
            <Link className="quick-action" href="/owner/customers"><b>02</b><span><strong>{t.addCustomer}</strong><small>{t.saveCustomerDues}</small></span></Link>
            <Link className="quick-action" href="/owner/products"><b>03</b><span><strong>{t.addProduct}</strong><small>{t.addStockGstPrice}</small></span></Link>
          </div>
        </section>

        <section className="card pos-panel">
          <div className="panel-head"><div><span className="page-kicker">{t.recentBills}</span><h2>{t.latestActivity}</h2></div><Link href="/owner/invoices">{t.viewAll}</Link></div>
          <div className="compact-list">
            {loading?<div className="skeleton-list"><i/><i/><i/></div>:data.recentInvoices.length === 0 ? <div className="empty-state">{t.noBillsDashboard}</div> : data.recentInvoices.map((invoice) => (
              <div className="compact-row" key={invoice.id}>
                <div><strong>{invoice.invoice_number}</strong><small>{new Date(invoice.created_at).toLocaleString('en-IN')}</small></div>
                <div className="compact-row-right"><strong>{formatINR(invoice.grand_total)}</strong><small>{localizedStatus(org.preferredLanguage,invoice.payment_status)}</small></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </OwnerShell>
  );
}
