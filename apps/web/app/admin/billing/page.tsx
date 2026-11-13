'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminDate, adminMoney } from '@/lib/admin-api';
import { authenticatedApiRequest } from '@/lib/firebase';

type Overview = {
  configured: boolean;
  provider: string;
  mode: string;
  plans: Array<{id:string;code:string;name:string;monthly_price:number;half_yearly_price:number|null;yearly_price:number;currency:string;provider_monthly_plan_id:string|null;provider_yearly_plan_id:string|null}>;
  subscriptions: Array<{id:string;organization_id:string;status:string;provider:string|null;provider_status:string|null;provider_subscription_id:string|null;billing_cycle:string|null;starts_at:string|null;ends_at:string|null;created_at:string}>;
  transactions: Array<{id:string;organization_id:string;amount:number;currency:string;status:string;method:string|null;provider_payment_id:string|null;created_at:string}>;
  webhooks: Array<{provider_event_id:string;event_type:string;processing_status:string;organization_id:string|null;received_at:string;error_message:string|null}>;
};

async function billingRequest<T>(path:string, init?:RequestInit):Promise<T> {
  try {
    return await authenticatedApiRequest<T>(`/admin/billing${path}`, init);
  } catch (error) {
    if (error instanceof Error && /token|session|unauthorized|access required/i.test(error.message)) throw new Error('ADMIN_SESSION_EXPIRED');
    throw error;
  }
}

export default function AdminBillingPage() {
  const router = useRouter(); const [data,setData]=useState<Overview|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=useCallback(async()=>{setError('');try{const response=await billingRequest<{success:true;data:Overview}>('/overview');setData(response.data);}catch(reason){const message=reason instanceof Error?reason.message:'Could not load billing';if(message==='ADMIN_SESSION_EXPIRED')router.push('/auth/login');else setError(message);}finally{setLoading(false);}},[router]);
  useEffect(()=>{void load();},[load]);
  const captured=useMemo(()=>data?.transactions.filter(transaction=>['captured','CAPTURED','SUCCESS','PAID'].includes(String(transaction.status))).reduce((sum,transaction)=>sum+Number(transaction.amount||0),0)??0,[data]);
  if(loading)return <main className="admin-loading"><div className="admin-loading-card">Loading Cashfree billing…</div></main>;
  return <main className="admin-page-standalone"><header className="admin-page-head"><div><span>PLATFORM BILLING</span><h1>Cashfree payments</h1><p>One-time plan payments and webhook health. AutoPay is not enabled.</p></div><Link className="btn btn-secondary" href="/admin">← Control Center</Link></header>{error&&<div className="form-error admin-error">{error}</div>}
  <div className="admin-metric-grid"><article><span>Integration</span><strong>{data?.configured?'KEYS CONFIGURED':'NOT CONFIGURED'}</strong><small>{data?.provider ?? 'CASHFREE'} · {data?.mode ?? 'sandbox'}</small></article><article><span>Subscriptions</span><strong>{data?.subscriptions.length??0}</strong><small>Recent provider/manual records</small></article><article><span>Captured</span><strong>{adminMoney(captured)}</strong><small>Loaded subscription payment history</small></article><article><span>Webhook failures</span><strong>{data?.webhooks.filter(webhook=>webhook.processing_status==='FAILED').length??0}</strong><small>Needs admin attention</small></article></div>
  <section className="admin-panel"><div className="admin-panel-head"><div><span>CASHFREE PLANS</span><h2>Subscription prices</h2></div></div><div className="admin-list">{data?.plans.map(plan=><div className="admin-list-row" key={plan.id}><div><strong>{plan.name}</strong><small>{adminMoney(plan.monthly_price)}/month · {plan.half_yearly_price!=null?adminMoney(plan.half_yearly_price):"—"}/6 months · {adminMoney(plan.yearly_price)}/year</small></div><div className="admin-plan-actions"><span>One-time checkout · No plan sync needed</span></div></div>)}</div></section>
  <section className="admin-panel"><div className="admin-panel-head"><div><span>WEBHOOKS</span><h2>Latest Cashfree events</h2></div></div><div className="admin-list">{(data?.webhooks??[]).length===0?<div className="admin-empty">No webhook events yet.</div>:data?.webhooks.map(webhook=><div className="admin-list-row" key={webhook.provider_event_id}><div><strong>{webhook.event_type}</strong><small>{adminDate(webhook.received_at)} · {webhook.provider_event_id}</small></div><div className="admin-row-right"><strong>{webhook.processing_status}</strong><small>{webhook.error_message??webhook.organization_id??'—'}</small></div></div>)}</div></section>
  </main>;
}
