'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { getFirebaseAuth } from '@/lib/firebase';
import { clearOfflineWorkspace } from '@/lib/offline-workspace';
import { signOut } from 'firebase/auth';
import { clearWorkspaceCache } from '@/lib/pos';
import { posText, type PosLanguage } from '@/lib/pos-i18n';
import { PosLanguageProvider, uiText } from '@/lib/pos-language';
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
  const activeFor=(href:string)=>pathname===href||(href!=='/staff'&&pathname.startsWith(`${href}/`));
  const currentSection=links.find(([href])=>activeFor(href));
  const sectionLabel=pathname==='/staff/invoice'
    ?uiText(language,'Bill receipt','बिल की रसीद','Bill ki receipt')
    :currentSection?.[1]??t.staffWorkspace;
  async function logout() { clearWorkspaceCache(); const uid=getFirebaseAuth().currentUser?.uid;if(uid)clearOfflineWorkspace(uid); await signOut(getFirebaseAuth()); router.push('/auth/login'); }
  return (
    <PosLanguageProvider language={language}>
    <main className="staff-shell" lang={language==='hi'?'hi':language==='hinglish'?'hi-Latn':'en'}>
      <header className="staff-topbar no-print">
        <div className="staff-topbar-left"><div className="brand-lockup"><span className="brand-mark" aria-hidden="true">BP</span><div className="brand-copy"><strong>Brandspire POS</strong><small>{t.staffWorkspace}</small></div></div><span className="staff-business-pill">{businessName}</span></div>
        <nav className="staff-nav" aria-label={uiText(language,'Staff navigation','कर्मचारी का नेविगेशन','Staff navigation')}>{links.map(([href,label]) => { const active=activeFor(href); return <Link key={href} title={label} aria-label={label} aria-current={active?'page':undefined} className={active ? 'active' : ''} href={href}><span className="nav-label">{label}</span></Link>; })}</nav>
        <div className="staff-topbar-right"><button className="btn" title={t.logout} aria-label={t.logout} onClick={logout}>{t.logout}</button></div>
      </header>
      <section className="staff-main">
        <header className="workspace-location no-print" aria-label={uiText(language,'Current section','मौजूदा पेज','Abhi khula page')}>
          <span className="workspace-location-label">{uiText(language,'You are viewing','आप यहाँ हैं','Aap yahan hain')}</span>
          <nav aria-label={uiText(language,'Breadcrumb','पेज का रास्ता','Page ka raasta')}>
            <Link className="workspace-location-business" href="/staff" title={t.dashboard} aria-label={`${businessName} · ${t.dashboard}`}>{businessName}</Link>
            <span aria-hidden="true"> / </span>
            <strong className="workspace-location-current" aria-current="page">{sectionLabel}</strong>
          </nav>
        </header>
        {children}
      </section>
      <nav className="mobile-workspace-nav staff-mobile-nav no-print" aria-label={uiText(language,'Staff quick navigation','कर्मचारी के मुख्य पेज','Staff ke main pages')}>
        {links.map(([href,label,icon])=>{const active=activeFor(href);return <Link key={href} title={label} aria-label={label} href={href} className={active?'active':''} aria-current={active?'page':undefined}><StaffNavIcon type={icon}/><span className="nav-label">{label}</span></Link>})}
      </nav>
      <BrandspireAssist language={language} role="STAFF" />
    </main>
    </PosLanguageProvider>
  );
}
