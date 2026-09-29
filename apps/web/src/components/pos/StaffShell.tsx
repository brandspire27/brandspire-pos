'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { clearWorkspaceCache } from '@/lib/pos';
import { posText, type PosLanguage } from '@/lib/pos-i18n';
import BrandspireAssist from '@/components/pos/BrandspireAssist';

type Props = { businessName: string; language?: PosLanguage; children: ReactNode };

function StaffNavIcon({ type }: { type: 'home'|'bill'|'customer'|'product' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if(type==='home') return <svg {...common}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></svg>;
  if(type==='bill') return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg>;
  if(type==='customer') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5"/><path d="M17 8v6M14 11h6"/></svg>;
  return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>;
}

export default function StaffShell({ businessName, language = 'en', children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = posText(language);
  const links: Array<[string,string,'home'|'bill'|'customer'|'product']> = [
    ['/staff', t.dashboard, 'home'],
    ['/staff/billing', t.createBill, 'bill'],
    ['/staff/customers', t.customers, 'customer'],
    ['/staff/products', t.products, 'product']
  ];
  const activeFor=(href:string)=>href==='/staff'?pathname===href:pathname.startsWith(href);
  async function logout() { clearWorkspaceCache(); await getSupabaseBrowserClient().auth.signOut(); router.push('/auth/login'); }
  return (
    <main className="staff-shell">
      <header className="staff-topbar no-print">
        <div className="staff-topbar-left"><div className="brand-lockup"><span className="brand-mark" aria-hidden="true">BP</span><div className="brand-copy"><strong>Brandspire POS</strong><small>{t.staffWorkspace}</small></div></div><span className="staff-business-pill">{businessName}</span></div>
        <nav className="staff-nav" aria-label="Staff navigation">{links.map(([href,label]) => { const active=activeFor(href); return <Link key={href} aria-current={active?'page':undefined} className={active ? 'active' : ''} href={href}>{label}</Link>; })}</nav>
        <div className="staff-topbar-right"><button className="btn" onClick={logout}>{t.logout}</button></div>
      </header>
      <section className="staff-main">{children}</section>
      <nav className="mobile-workspace-nav staff-mobile-nav no-print" aria-label="Staff quick navigation">
        {links.map(([href,label,icon])=>{const active=activeFor(href);return <Link key={href} href={href} className={active?'active':''} aria-current={active?'page':undefined}><StaffNavIcon type={icon}/><span>{label}</span></Link>})}
      </nav>
      <BrandspireAssist language={language} role="STAFF" />
    </main>
  );
}
