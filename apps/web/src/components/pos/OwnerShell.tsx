'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { clearWorkspaceCache } from '@/lib/pos';
import { posLanguageLabel, posText, type PosLanguage } from '@/lib/pos-i18n';
import { phase8Text } from '@/lib/phase8-i18n';
import { phase9Text } from '@/lib/phase9-i18n';
import BrandspireAssist from '@/components/pos/BrandspireAssist';

type Props = { businessName: string; language?: PosLanguage; children: ReactNode };
type IconName = 'grid'|'receipt'|'users'|'box'|'inventory'|'file'|'wallet'|'reports'|'staff'|'settings';

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'grid') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>;
  if (name === 'receipt') return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg>;
  if (name === 'users') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5"/><path d="M16 5.5a3 3 0 0 1 0 5.5M16.5 14c2.3.4 3.7 2 4 5"/></svg>;
  if (name === 'box') return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === 'inventory') return <svg {...common}><path d="M4 7h16v13H4zM7 4h10l2 3H5l2-3Z"/><path d="M9 11h6M12 11v5"/></svg>;
  if (name === 'file') return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>;
  if (name === 'wallet') return <svg {...common}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="M4 8h13M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor" stroke="none"/></svg>;
  if (name === 'reports') return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
  if (name === 'staff') return <svg {...common}><circle cx="8.5" cy="8" r="3"/><path d="M3 20c.6-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M17 8v6M14 11h6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.6V21h-4v-.1A1.8 1.8 0 0 0 8.8 19a1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 2.8 13H3V9h-.2A1.8 1.8 0 0 0 4.4 8a1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 2.1V2h4v.1a1.8 1.8 0 0 0 1.1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1L20 6l-.1.1a1.8 1.8 0 0 0-.4 2A1.8 1.8 0 0 0 21.1 9h.1v4h-.1a1.8 1.8 0 0 0-1.7 2Z"/></svg>;
}

function isActive(pathname: string, href: string) {
  return href === '/owner' ? pathname === href : pathname.startsWith(href);
}

export default function OwnerShell({ businessName, language = 'en', children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = posText(language);
  const p8 = phase8Text(language);
  const p9 = phase9Text(language);
  const links: Array<[string,string,IconName]> = [
    ['/owner', t.dashboard, 'grid'],
    ['/owner/billing', t.createBill, 'receipt'],
    ['/owner/customers', t.customers, 'users'],
    ['/owner/products', t.products, 'box'],
    ['/owner/inventory', t.inventory, 'inventory'],
    ['/owner/invoices', t.invoices, 'file'],
    ['/owner/dues', t.dues, 'wallet'],
    ['/owner/ledger', p8.ledger, 'file'],
    ['/owner/returns', p8.returns, 'inventory'],
    ['/owner/reports', t.reports, 'reports'],
    ['/owner/staff', t.staff, 'staff'],
    ['/owner/subscription', p9.nav, 'wallet'],
    ['/owner/settings', t.settings, 'settings']
  ];
  const mobileLinks: Array<[string,string,IconName]> = [
    ['/owner', t.dashboard, 'grid'],
    ['/owner/billing', t.createBill, 'receipt'],
    ['/owner/invoices', t.invoices, 'file'],
    ['/owner/reports', t.reports, 'reports'],
    ['/owner/settings', t.settings, 'settings']
  ];

  async function logout(){
    clearWorkspaceCache();
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/auth/login');
  }

  return (
    <main className="dashboard pos-dashboard">
      <div className="dashboard-grid pos-dashboard-grid">
        <aside className="sidebar pos-sidebar" aria-label="Owner navigation">
          <div>
            <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">BP</span><div className="brand-copy"><strong>Brandspire POS</strong><small>{t.ownerWorkspace}</small></div></div>
            <div className="sidebar-business"><span className="business-dot" aria-hidden="true" />{businessName}</div>
            <nav>{links.map(([href,label,icon])=>{const active=isActive(pathname,href);return <Link key={href} aria-current={active?'page':undefined} className={active?'active':''} href={href}><span className="nav-icon"><NavIcon name={icon}/></span><span>{label}</span></Link>})}</nav>
          </div>
          <div className="sidebar-bottom"><div className="brandspire-mini"><span>BRANDSPIRE</span><small>{t.softwareSolutions}</small></div><button className="sidebar-logout" onClick={logout}>{t.logout}</button><small>{posLanguageLabel(language)} · {t.secureWorkspace}</small></div>
        </aside>
        <section className="content pos-content">{children}</section>
      </div>
      <nav className="mobile-workspace-nav no-print" aria-label="Owner quick navigation">
        {mobileLinks.map(([href,label,icon])=>{const active=isActive(pathname,href);return <Link key={href} href={href} className={active?'active':''} aria-current={active?'page':undefined}><NavIcon name={icon}/><span>{label}</span></Link>})}
      </nav>
      <BrandspireAssist language={language} role="OWNER" />
    </main>
  );
}
