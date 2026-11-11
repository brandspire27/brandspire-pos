'use client';
import { useEffect,useRef,useState } from 'react';
import {getFirebaseAuth} from '@/lib/firebase';
import {recoveryKey} from '@/lib/billing-recovery';
import {pendingBill,removePendingBill,type OfflineBill} from '@/lib/offline-bill';
import {createInvoice} from '@/lib/pos-api';
export default function PendingOfflineBill({organizationId,onSynced}:{organizationId:string;onSynced:()=>void}){
  const [bill,setBill]=useState<OfflineBill|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
  useEffect(()=>{let active=true;const load=async()=>{const uid=getFirebaseAuth().currentUser?.uid;if(!uid)return;try{const value=await pendingBill(recoveryKey(uid,organizationId));if(active)setBill(value);}catch{if(active)setError('Device storage unavailable. Offline saving is not ready.');}};void load();window.addEventListener('brandspire-pending-bill',load);return()=>{active=false;window.removeEventListener('brandspire-pending-bill',load);};},[organizationId]);
  async function sync(){
    if(!bill||lock.current)return;
    const uid=getFirebaseAuth().currentUser?.uid;
    if(!uid||bill.key!==recoveryKey(uid,organizationId)){setError('Sign in to the original account to sync.');return;}
    lock.current=true;setBusy(true);setError('');
    try{await createInvoice(bill.input);await removePendingBill(bill.key,bill.id);setBill(null);onSynced();}
    catch(e){setError(e instanceof Error?e.message:'Sync failed. Bill remains on this device.');}
    finally{lock.current=false;setBusy(false);}
  }
  if(!bill&&!error)return null;
  return <section className="card"><h2>इस डिवाइस पर बिल लंबित है</h2>{bill&&<><p>Local reference: {bill.id}. अभी server invoice नहीं बना है। Internet आने पर sync करें।</p><ul>{bill.lines.map((line,i)=><li key={i}>{line.name} × {line.quantity}</li>)}</ul><p>Payment recorded as: {String(bill.input.paymentMethod)}. This is not online payment verification.</p><button className="btn btn-primary" disabled={busy} onClick={sync}>{busy?'Sync हो रहा है…':'इंटरनेट आ गया — Sync करें'}</button></>}{error&&<p role="alert" className="form-error">{error}</p>}</section>;
}
