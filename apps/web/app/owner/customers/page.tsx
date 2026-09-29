'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { posText } from '@/lib/pos-i18n';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type Customer = { id:string; name:string; phone:string|null; email:string|null; address:string|null; state:string|null; gstin:string|null; outstanding_balance:number; created_at:string };
const emptyForm = { name:'', phone:'', email:'', address:'', state:'', gstin:'', notes:'' };

export default function CustomersPage() {
  const router=useRouter();
  const [org,setOrg]=useState<CurrentOrganization|null>(null);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [query,setQuery]=useState('');
  const [form,setForm]=useState(emptyForm);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const loadCustomers=useCallback(async(organizationId:string)=>{
    const {data,error:loadError}=await getSupabaseBrowserClient().from('customers').select('id,name,phone,email,address,state,gstin,outstanding_balance,created_at').eq('organization_id',organizationId).is('deleted_at',null).order('created_at',{ascending:false}).limit(200);
    if(loadError)throw loadError;setCustomers((data??[]) as Customer[]);
  },[]);

  useEffect(()=>{getCurrentOrganization().then(async current=>{if(!current)return router.replace('/auth/login');if(current.role!=='OWNER')return router.replace('/staff');setOrg(current);try{await loadCustomers(current.organizationId);}catch(err){setError(err instanceof Error?err.message:'Could not load customers.');}});},[loadCustomers,router]);

  const filtered=useMemo(()=>{const text=query.toLowerCase().trim();if(!text)return customers;return customers.filter(c=>[c.name,c.phone,c.email,c.gstin].some(v=>String(v??'').toLowerCase().includes(text)));},[customers,query]);
  const t=posText(org?.preferredLanguage??'en');

  async function addCustomer(event:FormEvent){event.preventDefault();if(!org||!form.name.trim())return;setSaving(true);setError('');const {error:insertError}=await getSupabaseBrowserClient().from('customers').insert({organization_id:org.organizationId,name:form.name.trim(),phone:form.phone.trim()||null,email:form.email.trim()||null,address:form.address.trim()||null,state:form.state.trim()||null,gstin:form.gstin.trim().toUpperCase()||null,notes:form.notes.trim()||null});setSaving(false);if(insertError)return setError(insertError.message);setForm(emptyForm);setShowForm(false);await loadCustomers(org.organizationId);}
  async function removeCustomer(customer:Customer){if(!org||!window.confirm(`${t.removeCustomerConfirm}\n${customer.name}`))return;const {error:deleteError}=await getSupabaseBrowserClient().from('customers').update({deleted_at:new Date().toISOString(),active:false}).eq('id',customer.id).eq('organization_id',org.organizationId);if(deleteError)return setError(deleteError.message);await loadCustomers(org.organizationId);}

  if(!org)return <WorkspaceLoader/>;

  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.customersKicker}</span><h1>{t.customersTitle}</h1><p>{t.customersSub}</p></div><button className="btn btn-primary" onClick={()=>setShowForm(v=>!v)}>{showForm?t.close:`+ ${t.addCustomer}`}</button></div>
    {error&&<div className="form-error">{error}</div>}
    {showForm&&<form className="card inline-form-panel" onSubmit={addCustomer}><div className="form-panel-head"><div><h2>{t.newCustomer}</h2><p>{t.newCustomerSub}</p></div></div><div className="grid-2">
      <div className="field"><label>{t.name} *</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></div>
      <div className="field"><label>{t.phone}</label><input className="input" inputMode="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="10-digit mobile"/></div>
      <div className="field"><label>{t.email}</label><input className="input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
      <div className="field"><label>{t.gstin}</label><input className="input" value={form.gstin} onChange={e=>setForm({...form,gstin:e.target.value})}/></div>
      <div className="field"><label>{t.state}</label><input className="input" value={form.state} onChange={e=>setForm({...form,state:e.target.value})} placeholder="Uttar Pradesh"/></div>
      <div className="field"><label>{t.address}</label><input className="input" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></div>
    </div><div className="form-actions"><button type="button" className="btn" onClick={()=>setShowForm(false)}>{t.cancel}</button><button className="btn btn-primary" disabled={saving}>{saving?t.saving:t.saveCustomer}</button></div></form>}
    <section className="card pos-panel"><div className="list-toolbar"><input className="input search-input" placeholder={t.searchCustomer} value={query} onChange={e=>setQuery(e.target.value)}/><span>{filtered.length} {t.customers.toLowerCase()}</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t.customer}</th><th>{t.contact}</th><th>{t.gstin}</th><th>{t.outstanding}</th><th></th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan={5}><div className="empty-state">{t.noCustomers}</div></td></tr>:filtered.map(customer=><tr key={customer.id}><td><strong>{customer.name}</strong><small>{customer.state||customer.address||t.noAddress}</small></td><td>{customer.phone||'—'}<small>{customer.email||''}</small></td><td>{customer.gstin||'—'}</td><td><strong>{formatINR(customer.outstanding_balance)}</strong></td><td className="table-action"><button className="text-danger" onClick={()=>removeCustomer(customer)}>{t.remove}</button></td></tr>)}</tbody></table></div></section>
  </OwnerShell>;
}
