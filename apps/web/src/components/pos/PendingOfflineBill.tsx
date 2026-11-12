'use client';
import {useEffect,useRef,useState} from 'react';
import {getFirebaseAuth,authenticatedApiRequest} from '@/lib/firebase';
import {recoveryKey} from '@/lib/billing-recovery';
import {pendingBills,removePendingBill,archivePendingBill,archivedBills,restoreArchivedBill,type OfflineBill} from '@/lib/offline-bill';
import {createInvoice} from '@/lib/pos-api';
export default function PendingOfflineBill({organizationId,onSynced}:{organizationId:string;onSynced:()=>void}){
  const [bills,setBills]=useState<OfflineBill[]>([]);
  const [archive,setArchive]=useState<OfflineBill[]>([]);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
  function accountKey(){const uid=getFirebaseAuth().currentUser?.uid;if(!uid)throw new Error('Sign in to the original account.');return recoveryKey(uid,organizationId);}
  async function load(){const key=accountKey();const [current,history]=await Promise.all([pendingBills(key),archivedBills(key)]);setBills(current);setArchive(history);}
  useEffect(()=>{let active=true;const refresh=async()=>{try{const key=accountKey();const [current,history]=await Promise.all([pendingBills(key),archivedBills(key)]);if(active){setBills(current);setArchive(history);}}catch{if(active)setError('Device storage unavailable. Close other POS tabs and retry.');}};void refresh();window.addEventListener('brandspire-pending-bill',refresh);return()=>{active=false;window.removeEventListener('brandspire-pending-bill',refresh);};},[organizationId]);
  async function act(action:'sync'|'archive'|'restore',selection:OfflineBill|OfflineBill[]){
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{
      const selectedBills=Array.isArray(selection)?selection:[selection];
      const key=accountKey();if(selectedBills.some(selected=>key!==selected.key))throw new Error('Sign in to the original account.');
      if(!navigator.locks)throw new Error('Use a browser with Web Locks support for safe pending-bill recovery.');
      await navigator.locks.request(`brandspire-pending:${key}`,async()=>{
        for(const selected of selectedBills){
        if(action==='restore'){await restoreArchivedBill(key,selected.id);continue;}
        const current=await pendingBills(key);if(!current.some(row=>row.id===selected.id))throw new Error('This bill changed in another tab. Reload the list.');
        // Look up committed invoices before any retry/archive, including after an uncertain response.
        const lookup=await authenticatedApiRequest<{data:{id:string;invoice_number:string}|null}>(`/pos/invoices/by-client/${selected.id}`);
        if(lookup.data){await removePendingBill(key,selected.id);setNotice(`Already saved: ${lookup.data.invoice_number}`);onSynced();continue;}
        if(action==='archive'){
          await archivePendingBill(key,selected.id);
          setNotice('Archived on this device, not billed or refunded. Reconcile any cash already collected. You can restore this record below.');
        }else{
          await createInvoice(selected.input);await removePendingBill(key,selected.id);setNotice('Bill synced.');onSynced();
        }
        }
      });
      await load();window.dispatchEvent(new Event('brandspire-pending-bill'));
    }catch(e){setError(e instanceof Error?e.message:'Operation failed. The device record is retained.');await load().catch(()=>{});}
    finally{lock.current=false;setBusy(false);}
  }
  if(!bills.length&&!archive.length&&!error&&!notice)return null;
  return <section className="card"><h2>डिवाइस के बिल / Device bills</h2>
    <p>बचे हुए बिल / Pending bills: {bills.length}</p>{bills.length>1&&<button className="btn btn-primary" disabled={busy} onClick={()=>act('sync',bills)}>सभी बिल Sync करें</button>}{bills.map(bill=><div key={bill.id}><p>Pending / स्थिति जाँच बाकी: {bill.id}. A lost response can mean the server already saved it; sync checks this first.</p><ul>{bill.lines.map((line,i)=><li key={i}>{line.name} × {line.quantity}</li>)}</ul><p>Payment entry: {String(bill.input.paymentMethod)}. This is not online payment verification.</p>
    <button className="btn btn-primary" disabled={busy} onClick={()=>act('sync',bill)}>{busy?'रुकिए…':'स्थिति जाँचें और Sync करें'}</button>
    <button className="btn" disabled={busy} onClick={()=>{if(window.confirm('Archive this pending sale on this device? It will not be billed or refunded. Reconcile money already collected. The record can be restored.'))void act('archive',bill);}}>अभी अलग रखें / Archive</button></div>)}
    {!!archive.length&&<details><summary>अलग रखे बिल / Archived ({archive.length})</summary>{archive.map(row=><div key={row.id}><p>{new Date(row.createdAt).toLocaleString()} · {row.lines.map(line=>`${line.name} × ${line.quantity}`).join(', ')}</p><button className="btn" disabled={busy} onClick={()=>act('restore',row)}>वापस खोलें / Restore</button></div>)}</details>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="form-error">{error}</p>}
  </section>;
}
