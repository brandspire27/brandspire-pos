'use client';
import {useEffect,useRef,useState} from 'react';
import {getFirebaseAuth,authenticatedApiRequest} from '@/lib/firebase';
import {recoveryKey} from '@/lib/billing-recovery';
import {pendingBills,removePendingBill,archivePendingBill,archivedBills,restoreArchivedBill,type OfflineBill} from '@/lib/offline-bill';
import {createInvoice} from '@/lib/pos-api';
import {uiText,usePosLanguage} from '@/lib/pos-language';
export default function PendingOfflineBill({organizationId,onSynced}:{organizationId:string;onSynced:()=>void}){
  const language=usePosLanguage();
  const tr=(en:string,hi:string,hinglish:string)=>uiText(language,en,hi,hinglish);
  const [bills,setBills]=useState<OfflineBill[]>([]);
  const [archive,setArchive]=useState<OfflineBill[]>([]);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
  function accountKey(){const uid=getFirebaseAuth().currentUser?.uid;if(!uid)throw new Error(tr('Sign in to the original account.','उसी खाते में साइन इन करें।','Usi account mein sign in karein.'));return recoveryKey(uid,organizationId);}
  async function load(){const key=accountKey();const [current,history]=await Promise.all([pendingBills(key),archivedBills(key)]);setBills(current);setArchive(history);}
  useEffect(()=>{let active=true;const refresh=async()=>{try{const key=accountKey();const [current,history]=await Promise.all([pendingBills(key),archivedBills(key)]);if(active){setBills(current);setArchive(history);}}catch{if(active)setError(tr('Device storage unavailable. Close other POS tabs and retry.','डिवाइस स्टोरेज उपलब्ध नहीं है। दूसरे POS टैब बंद करके दोबारा कोशिश करें।','Device storage available nahi hai. Doosre POS tabs band karke dobara koshish karein.'));}};void refresh();window.addEventListener('brandspire-pending-bill',refresh);return()=>{active=false;window.removeEventListener('brandspire-pending-bill',refresh);};},[organizationId]);
  async function act(action:'sync'|'archive'|'restore',selection:OfflineBill|OfflineBill[]){
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{
      const selectedBills=Array.isArray(selection)?selection:[selection];
      const key=accountKey();if(selectedBills.some(selected=>key!==selected.key))throw new Error(tr('Sign in to the original account.','उसी खाते में साइन इन करें।','Usi account mein sign in karein.'));
      if(!navigator.locks)throw new Error(tr('Update your browser to recover pending bills safely.','बाकी बिल सुरक्षित वापस लाने के लिए ब्राउज़र अपडेट करें।','Baaki bills surakshit wapas laane ke liye browser update karein.'));
      await navigator.locks.request(`brandspire-pending:${key}`,async()=>{
        for(const selected of selectedBills){
        if(action==='restore'){await restoreArchivedBill(key,selected.id);continue;}
        const current=await pendingBills(key);if(!current.some(row=>row.id===selected.id))throw new Error(tr('This bill changed in another tab. Reload the list.','यह बिल दूसरे टैब में बदल गया। सूची दोबारा खोलें।','Yeh bill doosre tab mein badal gaya. List dobara kholein.'));
        // Look up committed invoices before any retry/archive, including after an uncertain response.
        const lookup=await authenticatedApiRequest<{data:{id:string;invoice_number:string}|null}>(`/pos/invoices/by-client/${selected.id}`);
        if(lookup.data){await removePendingBill(key,selected.id);setNotice(`${tr('Already saved','पहले से सेव है','Pehle se save hai')}: ${lookup.data.invoice_number}`);onSynced();continue;}
        if(action==='archive'){
          await archivePendingBill(key,selected.id);
          setNotice(tr('Kept aside on this device. No bill or refund was created. Check any money already collected. You can restore this record below.','इस डिवाइस पर अलग रखा गया। कोई बिल या रिफंड नहीं बना। पहले से लिए पैसे जाँचें। नीचे से रिकॉर्ड वापस खोल सकते हैं।','Is device par alag rakha gaya. Koi bill ya refund nahi bana. Pehle se liye paise check karein. Neeche se record wapas khol sakte hain.'));
        }else{
          await createInvoice(selected.input);await removePendingBill(key,selected.id);setNotice(tr('Bill synced.','बिल सिंक हो गया।','Bill sync ho gaya.'));onSynced();
        }
        }
      });
      await load();window.dispatchEvent(new Event('brandspire-pending-bill'));
    }catch(e){setError(e instanceof Error?e.message:tr('Could not complete this action. The record is still on this device.','यह काम पूरा नहीं हुआ। रिकॉर्ड इसी डिवाइस पर सुरक्षित है।','Yeh kaam poora nahi hua. Record isi device par surakshit hai.'));await load().catch(()=>{});}
    finally{lock.current=false;setBusy(false);}
  }
  if(!bills.length&&!archive.length&&!error&&!notice)return null;
  return <section className="card"><h2>{tr('Device bills','डिवाइस के बिल','Device ke bills')}</h2>
    <p>{tr('Pending bills','बाकी बिल','Baaki bills')}: {bills.length}</p>{bills.length>1&&<button className="btn btn-primary" disabled={busy} onClick={()=>act('sync',bills)}>{tr('Sync all bills','सभी बिल सिंक करें','Sabhi bills sync karein')}</button>}{bills.map(bill=><div key={bill.id}><p>{tr('Status check pending','स्थिति जाँच बाकी','Status check baaki')}: {bill.id}. {tr('The server may have already saved this bill. Sync checks that before retrying.','हो सकता है यह बिल पहले ही सर्वर पर सेव हो गया हो। सिंक करने पर पहले इसकी जाँच होगी।','Ho sakta hai yeh bill pehle hi server par save ho. Sync karne par pehle iski jaanch hogi.')}</p><ul>{bill.lines.map((line,i)=><li key={i}>{line.name} × {line.quantity}</li>)}</ul><p>{tr('Payment entry','भुगतान का विवरण','Payment entry')}: {String(bill.input.paymentMethod)}. {tr('This does not verify an online payment.','यह ऑनलाइन भुगतान की पुष्टि नहीं है।','Yeh online payment ki pushti nahi hai.')}</p>
    <button className="btn btn-primary" disabled={busy} onClick={()=>act('sync',bill)}>{busy?tr('Please wait…','रुकिए…','Rukiye…'):tr('Check status & sync','स्थिति जाँचें और सिंक करें','Status check karke sync karein')}</button>
    <button className="btn" disabled={busy} onClick={()=>{if(window.confirm(tr('Keep this pending sale aside on this device? No bill or refund will be created. Check money already collected. You can restore the record later.','इस बाकी बिक्री को डिवाइस पर अलग रखें? कोई बिल या रिफंड नहीं बनेगा। पहले से लिए पैसे जाँचें। रिकॉर्ड बाद में वापस खोल सकते हैं।','Is baaki sale ko device par alag rakhein? Koi bill ya refund nahi banega. Pehle se liye paise check karein. Record baad mein wapas khol sakte hain.')))void act('archive',bill);}}>{tr('Keep aside','अभी अलग रखें','Abhi alag rakhein')}</button></div>)}
    {!!archive.length&&<details><summary>{tr('Kept aside','अलग रखे बिल','Alag rakhe bills')} ({archive.length})</summary>{archive.map(row=><div key={row.id}><p>{new Date(row.createdAt).toLocaleString(language==='hi'?'hi-IN':'en-IN')} · {row.lines.map(line=>`${line.name} × ${line.quantity}`).join(', ')}</p><button className="btn" disabled={busy} onClick={()=>act('restore',row)}>{tr('Restore','वापस खोलें','Wapas kholein')}</button></div>)}</details>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="form-error">{error}</p>}
  </section>;
}
