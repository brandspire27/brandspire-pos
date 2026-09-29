'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminDate, adminMoney } from '@/lib/admin-api';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type Overview = {
  configured: boolean;
  provider: string;
  mode: string;
  plans: Array<{id:string;code:string;name:string;monthly_price:number;yearly_price:number;currency:string;provider_monthly_plan_id:string|null;provider_yearly_plan_id:string|null}>;
  subscriptions: Array<{id:string;organization_id:string;status:string;provider:string|null;provider_status:string|null;provider_subscription_id:string|null;billing_cycle:string|null;starts_at:string|null;ends_at:string|null;created_at:string}>;
  transactions: Array<{id:string;organization_id:string;amount:number;currency:string;status:string;method:string|null;provider_payment_id:string|null;created_at:string}>;
  webhooks: Array<{provider_event_id:string;event_type:string;processing_status:string;organization_id:string|null;received_at:string;error_message:string|null}>;
};

async function billingRequest<T>(path:string, init?:RequestInit):Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('ADMIN_SESSION_EXPIRED');
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const response = await fetch(`${base}/api/admin/billing${path}`, { ...init, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('ADMIN_SESSION_EXPIRED');
  if (!response.ok) throw new Error(body?.message ?? 'Cashfree billing request failed');
  return body as T;
}

export default function AdminBillingPage() {
  const router = useRouter(); const [data,setData]=useState<Overview|null>(null); const [loading,setLoading]=useState(true); const [working,setWorking]=useState(''); const [error,setError]=useState('');
  const load=useCallback(async()=>{setError('');try{const response=await billingRequest<{success:true;data:Overview}>('/overview');setData(response.data);}catch(reason){const message=reason instanceof Error?reason.message:'Could not load billing';if(message==='ADMIN_SESSION_EXPIRED')router.push('/auth/login');else setError(message);}finally{setLoading(false);}},[router]);
  useEffect(()=>{void load();},[load]);
  const captured=useMemo(()=>data?.transactions.filter(transaction=>['captured','CAPTURED','SUCCESS','PAID'].includes(String(transaction.status))).reduce((sum,transaction)=>sum+Number(transaction.amount||0),0)??0,[data]);
  async function sync(id:string,cycle:'MONTHLY'|'YEARLY'){setWorking(`${id}-${cycle}`);setError('');try{await billingRequest(`/plans/${id}/sync`,{method:'POST',body:JSON.stringify({billingCycle:cycle})});await load();}catch(reason){setError(reason instanceof Error?reason.message:'Plan sync failed');}finally{setWorking('');}}
  if(loading)return <main className="admin-loading"><div className="admin-loading-card">Loading Cashfree billing…</div></main>;
  return <main className="admin-page-standalone"><header className="admin-page-head"><div><span>PLATFORM BILLING</span><h1>Cashfree subscriptions</h1><p>Monitor recurring plans, subscription state, payment captures and webhook health.</p></div><Link className="btn btn-secondary" href="/admin">← Control Center</Link></header>{error&&<div className="form-error admin-error">{error}</div>}
  <div className="admin-metric-grid"><article><span>Integration</span><strong>{data?.configured?'READY':'NOT CONFIGURED'}</strong><small>{data?.provider ?? 'CASHFREE'} · {data?.mode ?? 'sandbox'}</small></article><article><span>Subscriptions</span><strong>{data?.subscriptions.length??0}</strong><small>Recent provider/manual records</small></article><article><span>Captured</span><strong>{adminMoney(captured)}</strong><small>Loaded subscription payment history</small></article><article><span>Webhook failures</span><strong>{data?.webhooks.filter(webhook=>webhook.processing_status==='FAILED').length??0}</strong><small>Needs admin attention</small></article></div>
  <section className="admin-panel"><div className="admin-panel-head"><div><span>CASHFREE PLANS</span><h2>Provider plan sync</h2></div></div><div className="admin-list">{data?.plans.map(plan=><div className="admin-list-row" key={plan.id}><div><strong>{plan.name}</strong><small>{adminMoney(plan.monthly_price)}/month · {adminMoney(plan.yearly_price)}/year</small></div><div className="admin-plan-actions"><button className="btn btn-secondary" disabled={!data.configured||!!plan.provider_monthly_plan_id||working!==''} onClick={()=>void sync(plan.id,'MONTHLY')}>{plan.provider_monthly_plan_id?'Monthly synced':'Sync monthly'}</button><button className="btn btn-secondary" disabled={!data.configured||!!plan.provider_yearly_plan_id||working!==''} onClick={()=>void sync(plan.id,'YEARLY')}>{plan.provider_yearly_plan_id?'Yearly synced':'Sync yearly'}</button></div></div>)}</div></section>
  <section className="admin-panel"><div className="admin-panel-head"><div><span>WEBHOOKS</span><h2>Latest Cashfree events</h2></div></div><div className="admin-list">{(data?.webhooks??[]).length===0?<div className="admin-empty">No webhook events yet.</div>:data?.webhooks.map(webhook=><div className="admin-list-row" key={webhook.provider_event_id}><div><strong>{webhook.event_type}</strong><small>{adminDate(webhook.received_at)} · {webhook.provider_event_id}</small></div><div className="admin-row-right"><strong>{webhook.processing_status}</strong><small>{webhook.error_message??webhook.organization_id??'—'}</small></div></div>)}</div></section>
  </main>;
}
