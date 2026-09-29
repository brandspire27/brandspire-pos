'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { phase8Text } from '@/lib/phase8-i18n';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type Customer = { id:string; name:string; phone:string|null; outstanding_balance:number };
type LedgerRow = { event_time:string; event_type:string; reference:string; description:string; debit:number; credit:number; running_balance:number };

export default function CustomerLedgerPage(){
  const router=useRouter();
  const [org,setOrg]=useState<CurrentOrganization|null>(null);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [ledger,setLedger]=useState<LedgerRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{getCurrentOrganization().then(async current=>{
    if(!current)return router.replace('/auth/login');
    if(current.role!=='OWNER')return router.replace('/staff');
    setOrg(current);
    const {data,error:customerError}=await getSupabaseBrowserClient().from('customers').select('id,name,phone,outstanding_balance').eq('organization_id',current.organizationId).is('deleted_at',null).order('name').limit(300);
    if(customerError)setError(customerError.message);else setCustomers((data??[]) as Customer[]);
  }).catch(err=>setError(err instanceof Error?err.message:'Could not load workspace.'));},[router]);

  const loadLedger=useCallback(async(customerId:string)=>{
    if(!org||!customerId){setLedger([]);return;}
    setLoading(true);setError('');
    const {data,error:ledgerError}=await getSupabaseBrowserClient().rpc('get_customer_ledger',{p_organization_id:org.organizationId,p_customer_id:customerId});
    if(ledgerError)setError(ledgerError.message);else setLedger((data??[]) as LedgerRow[]);
    setLoading(false);
  },[org]);

  useEffect(()=>{void loadLedger(selectedId);},[selectedId,loadLedger]);

  const selected=useMemo(()=>customers.find(c=>c.id===selectedId)??null,[customers,selectedId]);
  const t=phase8Text(org?.preferredLanguage??'en');
  if(!org)return <WorkspaceLoader/>;

  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.ledgerKicker}</span><h1>{t.ledgerTitle}</h1><p>{t.ledgerSub}</p></div></div>
    {error&&<div className="form-error">{error}</div>}
    <div className="ledger-layout">
      <aside className="card ledger-selector-card">
        <label>{t.selectCustomer}<select value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">— {t.selectCustomer} —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:''}</option>)}</select></label>
        {selected?<div className="ledger-customer-summary"><span>{selected.name}</span><strong>{formatINR(selected.outstanding_balance)}</strong><small>{t.currentOutstanding}</small></div>:<div className="empty-state compact">{t.chooseCustomer}</div>}
      </aside>
      <section className="card ledger-history-card">
        <div className="section-head"><div><span className="page-kicker">{t.ledgerHistory}</span><h2>{selected?.name??t.selectCustomer}</h2></div></div>
        {loading?<div className="empty-state">{t.loadingLedger}</div>:!selected?<div className="empty-state">{t.chooseCustomer}</div>:ledger.length===0?<div className="empty-state">{t.noLedger}</div>:<div className="data-table-wrap"><table className="data-table ledger-table"><thead><tr><th>{t.details}</th><th>{t.reference}</th><th>{t.debit}</th><th>{t.credit}</th><th>{t.balance}</th></tr></thead><tbody>{ledger.map((row,index)=><tr key={`${row.event_time}-${row.reference}-${index}`}><td><strong>{row.event_type.replaceAll('_',' ')}</strong><small>{formatDateTime(row.event_time)} · {row.description}</small></td><td>{row.reference}</td><td>{Number(row.debit)>0?formatINR(row.debit):'—'}</td><td>{Number(row.credit)>0?formatINR(row.credit):'—'}</td><td><strong>{formatINR(row.running_balance)}</strong></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </OwnerShell>;
}
