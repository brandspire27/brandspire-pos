'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { phase9Text } from '@/lib/phase9-i18n';
import { cancelSubscription, createSubscriptionCheckout, ensureRazorpayCheckout, getSubscriptionOverview, verifySubscriptionCheckout, type SubscriptionOverview } from '@/lib/subscription-api';

type RazorpayResult = { razorpay_payment_id?:string; razorpay_subscription_id?:string; razorpay_signature?:string };

export default function SubscriptionPage() {
  const router = useRouter();
  const [org,setOrg] = useState<CurrentOrganization|null>(null);
  const [overview,setOverview] = useState<SubscriptionOverview|null>(null);
  const [loading,setLoading] = useState(true);
  const [working,setWorking] = useState('');
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');

  const load = useCallback(async()=>{
    try {
      const current = await getCurrentOrganization();
      if(!current){router.replace('/auth/login');return;}
      if(current.role!=='OWNER'){router.replace('/staff');return;}
      setOrg(current);
      const result = await getSubscriptionOverview();
      setOverview(result.data);
    } catch(err){ setError(err instanceof Error?err.message:'Could not load subscription.'); }
    finally{setLoading(false);}
  },[router]);

  useEffect(()=>{load();},[load]);
  if(loading || !org) return <WorkspaceLoader/>;
  const t = phase9Text(org.preferredLanguage);

  async function start(planId:string, cycle:'MONTHLY'|'YEARLY'){
    setWorking(`${planId}-${cycle}`);setError('');setSuccess('');
    try{
      await ensureRazorpayCheckout();
      const checkout = (await createSubscriptionCheckout(planId,cycle)).data;
      if(!window.Razorpay) throw new Error('Razorpay Checkout did not load');
      const rzp = new window.Razorpay({
        key:checkout.keyId,
        subscription_id:checkout.subscriptionId,
        name:'Brandspire POS',
        description:`${checkout.planName} · ${cycle==='MONTHLY'?'Monthly':'Yearly'}`,
        prefill:{email:checkout.ownerEmail},
        notes:{product:'Brandspire POS'},
        theme:{color:'#3159d9'},
        handler:async(result:unknown)=>{
          const response=result as RazorpayResult;
          if(!response.razorpay_payment_id||!response.razorpay_subscription_id||!response.razorpay_signature){setError(t.checkoutFailed);return;}
          setSuccess(t.finalizing);
          await verifySubscriptionCheckout({paymentId:response.razorpay_payment_id,subscriptionId:response.razorpay_subscription_id,signature:response.razorpay_signature});
          setSuccess(t.activated);setWorking('');await load();
        },
        modal:{ondismiss:()=>setWorking('')}
      });
      rzp.on('payment.failed',()=>{setError(t.checkoutFailed);setWorking('');});
      rzp.open();
    }catch(err){setError(err instanceof Error?err.message:t.checkoutFailed);setWorking('');}
  }

  async function cancel(){
    if(!window.confirm(t.cancelConfirm))return;
    setWorking('cancel');setError('');
    try{await cancelSubscription(true);await load();}
    catch(err){setError(err instanceof Error?err.message:'Could not cancel renewal.');}
    finally{setWorking('');}
  }

  const current = overview?.current;
  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.kicker}</span><h1>{t.title}</h1><p>{t.sub}</p></div></div>
    {error&&<div className="form-error">{error}</div>}{success&&<div className="form-success">{success}</div>}

    <section className="card pos-panel subscription-current-card">
      <div className="panel-head"><div><span className="page-kicker">{t.current}</span><h2>{current?.status ?? org.subscriptionStatus}</h2></div><span className="status-badge">{current?.provider ?? 'BRANDSPIRE'}</span></div>
      <div className="subscription-detail-grid">
        <div><small>{t.activeUntil}</small><strong>{formatDateTime(current?.ends_at ?? org.endsAt)}</strong></div>
        <div><small>{t.providerStatus}</small><strong>{current?.provider_status ?? '—'}</strong></div>
        <div><small>{t.nextCharge}</small><strong>{formatDateTime(current?.next_charge_at)}</strong></div>
      </div>
      {current?.provider_subscription_id && !current.cancel_at_period_end && ['ACTIVE','TRIAL'].includes(current.status) && <button className="btn btn-secondary" disabled={working==='cancel'} onClick={cancel}>{t.cancel}</button>}
      {current?.cancel_at_period_end&&<div className="soft-note">Automatic renewal is scheduled to stop at the end of the current billing cycle.</div>}
    </section>

    {!overview?.configured&&<div className="soft-note top-gap">{t.notConfigured}</div>}

    <section className="card pos-panel top-gap"><div className="panel-head"><div><span className="page-kicker">{t.planOptions}</span><h2>Brandspire POS</h2></div></div>
      <div className="subscription-plan-grid">{(overview?.plans??[]).map(plan=><article className="subscription-plan" key={plan.id}><div><span className="page-kicker">{plan.code}</span><h3>{plan.name}</h3></div><div className="plan-price-row"><div><small>{t.monthly}</small><strong>{formatINR(plan.monthly_price)}</strong><button className="btn btn-primary" disabled={!overview?.configured||working!==''} onClick={()=>start(plan.id,'MONTHLY')}>{working===`${plan.id}-MONTHLY`?'…':t.start}</button></div><div><small>{t.yearly} · {t.saveYearly}</small><strong>{formatINR(plan.yearly_price)}</strong><button className="btn btn-secondary" disabled={!overview?.configured||working!==''} onClick={()=>start(plan.id,'YEARLY')}>{working===`${plan.id}-YEARLY`?'…':t.start}</button></div></div>{overview?.configured&&(!plan.provider_monthly_plan_id||!plan.provider_yearly_plan_id)&&<small className="warning-text">{t.configureAdmin}</small>}</article>)}</div>
    </section>

    <section className="card pos-panel top-gap"><div className="panel-head"><div><span className="page-kicker">{t.paymentHistory}</span><h2>{t.paymentHistory}</h2></div></div>
      <div className="compact-list">{(overview?.transactions??[]).length===0?<div className="empty-state">{t.noPayments}</div>:(overview?.transactions??[]).map(tx=><div className="compact-row" key={tx.id}><div><strong>{formatINR(tx.amount)}</strong><small>{tx.method??'Razorpay'} · {formatDateTime(tx.captured_at??tx.created_at)}</small></div><div className="compact-row-right"><strong>{tx.status}</strong><small>{tx.provider_payment_id??'—'}</small></div></div>)}</div>
    </section>
  </OwnerShell>;
}
