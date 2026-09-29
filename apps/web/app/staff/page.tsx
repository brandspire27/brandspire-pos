'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StaffShell from '@/components/pos/StaffShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { getCurrentOrganization, isSubscriptionUsable, type CurrentOrganization } from '@/lib/pos';
import { posText } from '@/lib/pos-i18n';

export default function StaffPage(){
  const router=useRouter();const[org,setOrg]=useState<CurrentOrganization|null>(null);
  useEffect(()=>{getCurrentOrganization().then(current=>{if(!current)return router.replace('/auth/login');if(current.role!=='STAFF')return router.replace('/owner');setOrg(current);});},[router]);
  if(!org)return <WorkspaceLoader/>;
  const t=posText(org.preferredLanguage);const active=isSubscriptionUsable(org.subscriptionStatus,org.endsAt);
  return <StaffShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="staff-welcome"><section className="staff-primary-card"><span className="page-kicker">{t.staffFastCounter}</span><h1>{active?t.staffReadyTitle:t.staffPausedTitle}</h1><p>{active?t.staffReadySub:t.staffPausedSub}</p>{active&&<Link className="staff-primary-button" href="/staff/billing">{t.createBill} →</Link>}</section><div className="staff-side-actions"><Link className="staff-action-card" href="/staff/customers"><b>+</b><h3>{t.addCustomer}</h3><p>{t.staffCustomerHelp}</p></Link><Link className="staff-action-card" href="/staff/products"><b>+</b><h3>{t.addProduct}</h3><p>{t.staffProductHelp}</p></Link></div></div>
    <div className="staff-policy-note">{t.staffRule}</div>
  </StaffShell>;
}
