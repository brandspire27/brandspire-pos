'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { phase9Text } from '@/lib/phase9-i18n';
import { cancelSubscription, createSubscriptionCheckout, ensureCashfreeCheckout, getSubscriptionOverview, verifySubscriptionCheckout, type SubscriptionOverview } from '@/lib/subscription-api';


export default function SubscriptionPage() {
  const router = useRouter();
  const [org,setOrg] = useState<CurrentOrganization|null>(null);
  const [overview,setOverview] = useState<SubscriptionOverview|null>(null);
  const [loading,setLoading] = useState(true);
  const [working,setWorking] = useState('');
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const processedReturn = useRef(false);

  const load = useCallback(async()=>{
    try {
      const current = await getCurrentOrganization();
      if(!current){router.replace('/auth/login');return;}
      if(current.role!=='OWNER'){router.replace('/staff');return;}
      setOrg(current);
      const result = await getSubscriptionOverview();
      setOverview(result.data);

      if (!processedReturn.current && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('cashfree_order_id');
        const failed = params.get('cashfree_payment') === 'failed';
        if (orderId) {
          processedReturn.current = true;
          setWorking('verify-return');
          setSuccess('Payment verification in progress…');
          try {
            const verification = await verifySubscriptionCheckout({ orderId });
            setSuccess(verification.data.verified ? 'Payment confirmed. Your plan is active.' : verification.data.providerStatus === 'TEST_PAYMENT_SUCCESS' ? 'Test payment passed. Live access is not activated by test payments.' : 'Payment is not confirmed yet. Use Check payment below.');
            const refreshed = await getSubscriptionOverview();
            setOverview(refreshed.data);
            if (verification.data.verified) window.history.replaceState({}, '', window.location.pathname);
          } catch(err) {
            setSuccess('');
            setError(err instanceof Error ? err.message : 'Checkout could not be completed.');
          } finally {
            setWorking('');
          }
        } else if (failed) {
          processedReturn.current = true;
          setError('Checkout could not be completed.');
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    } catch(err){ setError(err instanceof Error?err.message:'Could not load subscription.'); }
    finally{setLoading(false);}
  },[router]);
  useEffect(()=>{void load();},[load]);
  if(loading || !org) return <WorkspaceLoader/>;
  const t = phase9Text(org.preferredLanguage);

  async function start(planId:string, cycle:'MONTHLY'|'YEARLY'){
    setWorking(`${planId}-${cycle}`);setError('');setSuccess('');
    try{
      const checkout = (await createSubscriptionCheckout(planId,cycle)).data;
      await ensureCashfreeCheckout(overview?.mode ?? 'sandbox');
      if(!window.Cashfree) throw new Error('Cashfree Checkout did not load');
      await window.Cashfree({mode:overview?.mode ?? 'sandbox'}).checkout({
        paymentSessionId: checkout.paymentSessionId,
        redirectTarget: '_self'
      });
    }catch(err){setError(err instanceof Error?err.message:t.checkoutFailed);setWorking('');}
  }

  async function checkOrder(orderId:string){
    setWorking('verify');setError('');setSuccess('');
    try {
      const result = await verifySubscriptionCheckout({orderId});
      setSuccess(result.data.verified ? 'Payment confirmed. Your plan is active.' : result.data.providerStatus === 'TEST_PAYMENT_SUCCESS' ? 'Test payment passed; no live access activated.' : 'Payment pending or incomplete. No plan activated.');
      setOverview((await getSubscriptionOverview()).data);
    } catch(err){setError(err instanceof Error ? err.message : 'Could not check payment.');}
    finally {setWorking('');}
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
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.kicker}</span><h1>{t.title}</h1><p>Ek baar payment karein. Plan khatam hone par manually renew karein—AutoPay band hai.</p></div></div>
    {error&&<div className="form-error">{error}</div>}{success&&<div className="form-success">{success}</div>}

    <section className="card pos-panel subscription-current-card">
      <div className="panel-head"><div><span className="page-kicker">{t.current}</span><h2>{current?.status ?? org.subscriptionStatus}</h2></div><span className="status-badge">{current?.provider ?? 'BRANDSPIRE'}</span></div>
      <div className="subscription-detail-grid">
        <div><small>{t.activeUntil}</small><strong>{formatDateTime(current?.ends_at ?? org.endsAt)}</strong></div>
        <div><small>{t.providerStatus}</small><strong>{current?.provider_status ?? '—'}</strong></div>
        <div><small>Renewal</small><strong>Manual · No AutoPay</strong></div>
      </div>
      {current?.provider === 'CASHFREE' && current?.provider_subscription_id && !current.cancel_at_period_end && ['ACTIVE','TRIAL'].includes(current.status) && <button className="btn btn-secondary" disabled={working==='cancel'} onClick={cancel}>{t.cancel}</button>}
      {current?.cancel_at_period_end&&<div className="soft-note">Automatic renewal is scheduled to stop at the end of the current billing cycle.</div>}
    </section>

    {overview?.mode === 'sandbox' && <div className="soft-note top-gap">Test mode: no real payment is collected.</div>}
    <button className="btn btn-secondary top-gap" disabled={working!==''} onClick={()=>{processedReturn.current=false;void load();}}>Check payment / Refresh</button>
    {!overview?.configured&&<div className="soft-note top-gap">{t.notConfigured}</div>}

    <section className="card pos-panel top-gap"><div className="panel-head"><div><span className="page-kicker">{t.planOptions}</span><h2>Brandspire POS</h2></div></div>
      <div className="subscription-plan-grid">{(overview?.plans??[]).map(plan=><article className="subscription-plan" key={plan.id}><div><span className="page-kicker">{plan.code}</span><h3>{plan.name}</h3></div><div className="plan-price-row"><div><small>{t.monthly}</small><strong>{formatINR(plan.monthly_price)}</strong><button className="btn btn-primary" disabled={!overview?.configured||working!==''} onClick={()=>start(plan.id,'MONTHLY')}>{working===`${plan.id}-MONTHLY`?'…':t.start}</button></div><div><small>{t.yearly} · {t.saveYearly}</small><strong>{formatINR(plan.yearly_price)}</strong><button className="btn btn-secondary" disabled={!overview?.configured||working!==''} onClick={()=>start(plan.id,'YEARLY')}>{working===`${plan.id}-YEARLY`?'…':t.start}</button></div></div></article>)}</div>
    </section>

    {(overview?.pendingOrders??[]).length>0 && <section className="card pos-panel top-gap"><h2>Recent checkouts</h2><p>Payment kar diya? Dobara pay karne se pehle status check karein.</p>{overview?.pendingOrders.map(order=><div className="compact-row" key={order.order_id}><span>{formatINR(order.amount)} · {formatDateTime(order.created_at)}</span><button className="btn btn-secondary" disabled={working!==''} onClick={()=>void checkOrder(order.order_id)}>Check payment</button></div>)}</section>}
    <section className="card pos-panel top-gap"><div className="panel-head"><div><span className="page-kicker">{t.paymentHistory}</span><h2>{t.paymentHistory}</h2></div></div>
      <div className="compact-list">{(overview?.transactions??[]).length===0?<div className="empty-state">{t.noPayments}</div>:(overview?.transactions??[]).map(tx=><div className="compact-row" key={tx.id}><div><strong>{formatINR(tx.amount)}</strong><small>{tx.method??'Cashfree'} · {formatDateTime(tx.captured_at??tx.created_at)}</small></div><div className="compact-row-right"><strong>{tx.status}</strong><small>{tx.provider_payment_id??'—'}</small></div></div>)}</div>
    </section>
  </OwnerShell>;
}
