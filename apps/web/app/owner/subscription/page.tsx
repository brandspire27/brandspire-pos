'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerShell from '@/components/pos/OwnerShell';
import WorkspaceLoader from '@/components/pos/WorkspaceLoader';
import { formatDateTime, formatINR, getCurrentOrganization, type CurrentOrganization } from '@/lib/pos';
import { phase9Text } from '@/lib/phase9-i18n';
import { localizedStatus } from '@/lib/pos-i18n';
import { uiText } from '@/lib/pos-language';
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
  const u = (en:string, hi:string, hinglish:string) => uiText(org?.preferredLanguage??'en',en,hi,hinglish);

  const load = useCallback(async()=>{
    try {
      const current = await getCurrentOrganization();
      if(!current){router.replace('/auth/login');return;}
      if(current.role!=='OWNER'){router.replace('/staff');return;}
      setOrg(current);
      const u = (en:string, hi:string, hinglish:string) => uiText(current.preferredLanguage,en,hi,hinglish);
      const result = await getSubscriptionOverview();
      setOverview(result.data);

      if (!processedReturn.current && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('cashfree_order_id');
        const failed = params.get('cashfree_payment') === 'failed';
        if (orderId) {
          processedReturn.current = true;
          setWorking('verify-return');
          setSuccess(u('Checking payment…','भुगतान जाँच रहे हैं…','Payment check ho raha hai…'));
          try {
            const verification = await verifySubscriptionCheckout({ orderId });
            setSuccess(verification.data.verified ? u('Payment confirmed. Your plan is active.','भुगतान की पुष्टि हो गई। आपका प्लान सक्रिय है।','Payment confirm ho gaya. Aapka plan active hai.') : verification.data.providerStatus === 'TEST_PAYMENT_SUCCESS' ? u('Test payment passed. Test payments do not activate live access.','टेस्ट भुगतान सफल रहा। इससे लाइव एक्सेस शुरू नहीं होता।','Test payment pass hua. Isse live access activate nahi hota.') : u('Payment is not confirmed yet. Use Check payment below.','भुगतान की पुष्टि अभी नहीं हुई। नीचे भुगतान जाँचें दबाएँ।','Payment abhi confirm nahi hua. Neeche Payment check karo dabao.'));
            const refreshed = await getSubscriptionOverview();
            setOverview(refreshed.data);
            if (verification.data.verified) window.history.replaceState({}, '', window.location.pathname);
          } catch(err) {
            setSuccess('');
            setError(err instanceof Error ? err.message : u('Checkout could not be completed.','चेकआउट पूरा नहीं हो सका।','Checkout poora nahi ho saka.'));
          } finally {
            setWorking('');
          }
        } else if (failed) {
          processedReturn.current = true;
          setError(u('Checkout could not be completed.','चेकआउट पूरा नहीं हो सका।','Checkout poora nahi ho saka.'));
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    } catch(err){ setError(err instanceof Error?err.message:'Could not load subscription.'); }
    finally{setLoading(false);}
  },[router]);
  useEffect(()=>{void load();},[load]);
  if(!loading&&!org&&error)return <main className="auth-wrap"><div className="card auth-card narrow"><p className="form-error" role="alert">{error}</p><button className="btn" onClick={()=>void load()}>{u('Try again','दोबारा कोशिश करें','Dobara try karo')}</button></div></main>;
  if(loading || !org) return <WorkspaceLoader/>;
  const t = phase9Text(org.preferredLanguage);

  async function start(planId:string, cycle:'MONTHLY'|'HALF_YEARLY'|'YEARLY'){
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
      setSuccess(result.data.verified ? u('Payment confirmed. Your plan is active.','भुगतान की पुष्टि हो गई। आपका प्लान सक्रिय है।','Payment confirm ho gaya. Aapka plan active hai.') : result.data.providerStatus === 'TEST_PAYMENT_SUCCESS' ? u('Test payment passed; no live access activated.','टेस्ट भुगतान सफल; लाइव एक्सेस शुरू नहीं हुआ।','Test payment pass; live access activate nahi hua.') : u('Payment pending or incomplete. No plan activated.','भुगतान लंबित या अधूरा है। प्लान सक्रिय नहीं हुआ।','Payment pending ya adhoora hai. Plan activate nahi hua.'));
      setOverview((await getSubscriptionOverview()).data);
    } catch(err){setError(err instanceof Error ? err.message : u('Could not check payment.','भुगतान जाँच नहीं हो सकी।','Payment check nahi ho saka.'));}
    finally {setWorking('');}
  }

  async function cancel(){
    if(!window.confirm(t.cancelConfirm))return;
    setWorking('cancel');setError('');
    try{await cancelSubscription(true);await load();}
    catch(err){setError(err instanceof Error?err.message:u('Could not cancel renewal.','नवीनीकरण रद्द नहीं हो सका।','Renewal cancel nahi ho saka.'));}
    finally{setWorking('');}
  }

  const current = overview?.current;
  return <OwnerShell businessName={org.organizationName} language={org.preferredLanguage}>
    <div className="content-head pos-page-head"><div><span className="page-kicker">{t.kicker}</span><h1>{t.title}</h1><p>{u("Pay once and renew manually when the plan ends. AutoPay is off.","एक बार भुगतान करें और प्लान खत्म होने पर खुद नवीनीकरण करें। ऑटोपे बंद है।","Ek baar payment karo. Plan khatam hone par khud renew karo. AutoPay band hai.")}</p></div></div>
    {error&&<div className="form-error" role="alert">{error}</div>}{success&&<div className="form-success" role="status">{success}</div>}

    <section className="card pos-panel subscription-current-card">
      <div className="panel-head"><div><span className="page-kicker">{t.current}</span><h2>{localizedStatus(org.preferredLanguage,current?.status ?? org.subscriptionStatus)}</h2></div><span className="status-badge">{current?.provider ?? 'BRANDSPIRE'}</span></div>
      <div className="subscription-detail-grid">
        <div><small>{t.activeUntil}</small><strong>{formatDateTime(current?.ends_at ?? org.endsAt)}</strong></div>
        <div><small>{t.providerStatus}</small><strong>{current?.provider_status ?? '—'}</strong></div>
        <div><small>{u("Renewal","नवीनीकरण","Renewal")}</small><strong>{u("Manual · No AutoPay","खुद करें · ऑटोपे बंद","Khud renew karo · AutoPay band")}</strong></div>
      </div>
      {current?.provider === 'CASHFREE' && current?.provider_subscription_id && !current.cancel_at_period_end && ['ACTIVE','TRIAL'].includes(current.status) && <button className="btn btn-secondary" disabled={working==='cancel'} onClick={cancel}>{t.cancel}</button>}
      {!!current?.cancel_at_period_end&&<div className="soft-note">{u("Automatic renewal will stop at the end of this billing cycle.","इस बिलिंग अवधि के अंत में अपने आप नवीनीकरण बंद होगा।","Is billing cycle ke end par automatic renewal band hoga.")}</div>}
    </section>

    {overview?.mode === 'sandbox' && <div className="soft-note top-gap">{u("Test mode: no real payment is collected.","टेस्ट मोड: असली पैसे नहीं लिए जाते।","Test mode: asli paise nahi liye jaate.")}</div>}
    <button className="btn btn-secondary top-gap" disabled={working!==''} onClick={()=>{processedReturn.current=false;void load();}}>{u("Check payment / Refresh","भुगतान जाँचें / रीफ्रेश","Payment check / Refresh")}</button>
    {!overview?.configured&&<div className="soft-note top-gap">{t.notConfigured}</div>}

    <section className="card pos-panel top-gap"><div className="panel-head"><div><span className="page-kicker">{t.planOptions}</span><h2>Brandspire POS</h2></div></div>
      {overview && overview.plans.length===0 && <div className="soft-note">{u("Plans are not published yet. Payment options appear here when pricing is available.","प्लान अभी प्रकाशित नहीं हुए हैं। कीमत उपलब्ध होने पर यहाँ भुगतान विकल्प दिखेंगे।","Plans abhi publish nahi hue. Price available hone par yahan payment options dikhenge.")}</div>}<div className="subscription-plan-grid">{(overview?.plans??[]).map(plan=><article className="subscription-plan" key={plan.id}><div><span className="page-kicker">{plan.code}</span><h3>{plan.name}</h3></div><div className="plan-price-row">{([
        {cycle:'MONTHLY',label:u('1 month','1 महीना','1 mahina'),price:plan.monthly_price},
        {cycle:'HALF_YEARLY',label:u('6 months','6 महीने','6 mahine'),price:plan.half_yearly_price},
        {cycle:'YEARLY',label:u('1 year','1 साल','1 saal'),price:plan.yearly_price}
      ] as const).map(option=><div key={option.cycle}><small>{option.label}</small><strong>{option.price!=null?formatINR(option.price):u('Unavailable','उपलब्ध नहीं','Available nahi')}</strong><button className="btn btn-primary" disabled={!overview?.configured||working!==''||!option.price} onClick={()=>start(plan.id,option.cycle)}>{working===`${plan.id}-${option.cycle}`?'…':u('Pay now','भुगतान करें','Pay karo')}</button></div>)}</div></article>)}</div>
    </section>

    {(overview?.pendingOrders??[]).length>0 && <section className="card pos-panel top-gap"><h2>{u("Recent checkouts","हाल के चेकआउट","Recent checkouts")}</h2><p>{u("Already paid? Check the status before paying again.","भुगतान कर दिया? दोबारा देने से पहले स्थिति जाँचें।","Payment kar diya? Dobara pay karne se pehle status check karo.")}</p>{overview?.pendingOrders.map(order=><div className="compact-row" key={order.order_id}><span>{formatINR(order.amount)} · {formatDateTime(order.created_at)}</span><button className="btn btn-secondary" disabled={working!==''} onClick={()=>void checkOrder(order.order_id)}>{u("Check payment","भुगतान जाँचें","Payment check karo")}</button></div>)}</section>}
    <section className="card pos-panel top-gap"><div className="panel-head"><div><span className="page-kicker">{t.paymentHistory}</span><h2>{t.paymentHistory}</h2></div></div>
      <div className="compact-list">{(overview?.transactions??[]).length===0?<div className="empty-state">{t.noPayments}</div>:(overview?.transactions??[]).map(tx=><div className="compact-row" key={tx.id}><div><strong>{formatINR(tx.amount)}</strong><small>{tx.method??'Cashfree'} · {formatDateTime(tx.captured_at??tx.created_at)}</small></div><div className="compact-row-right"><strong>{localizedStatus(org.preferredLanguage,tx.status)}</strong><small>{tx.provider_payment_id??'—'}</small></div></div>)}</div>
    </section>
  </OwnerShell>;
}
