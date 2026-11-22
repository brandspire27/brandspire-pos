'use client';

import {useEffect,useRef,useState} from 'react';
import {addProduct} from '@/lib/pos-api';
import {getCurrentOrganization} from '@/lib/pos';
import {getFirebaseAuth} from '@/lib/firebase';

import {photoBatchKey,readPhotoBatch,savePhotoBatch,type PhotoProductRow as Row,type PhotoProductBatch as Batch} from '@/lib/product-photo-batch';

export default function ProductBatchReview({products,unresolved,hindi,onSaved,onClose}:{products:Record<string,unknown>[];unresolved:string[];hindi:boolean;onSaved?:()=>void|Promise<void>;onClose:()=>void}) {
  const [batch,setBatch]=useState<Batch|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const lock=useRef(false);
  const storageKey=useRef('');
  const ownerUid=useRef('');
  const lastRaw=useRef<string|null>(null);
  const current=useRef<Batch|null>(null);
  function persist(next:Batch){if(localStorage.getItem(storageKey.current)!==lastRaw.current)throw Error('This import changed in another tab. Reload to continue safely.');const raw=JSON.stringify(next);localStorage.setItem(storageKey.current,raw);lastRaw.current=raw;current.current=next;setBatch(next);}
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const org=await getCurrentOrganization();const uid=getFirebaseAuth().currentUser?.uid;
        if(!org||!uid)throw Error('Sign in before reviewing products.');
        const key=photoBatchKey(uid,org.organizationId);
        const saved=localStorage.getItem(key);
        const previous=saved?readPhotoBatch(saved):null;
        const next=previous??{rows:products.map(p=>({id:crypto.randomUUID(),name:String(p.name??''),selling_price:p.selling_price==null?null:Number(p.selling_price),stock:Number(p.stock??0),unit:String(p.unit??'pcs'),tax_rate:Number(p.tax_rate??0),tax_inclusive:Boolean(p.tax_inclusive),selected:true,state:'draft' as const})),unresolved};
        if(!active)return;
        storageKey.current=key;ownerUid.current=uid;lastRaw.current=saved;persist(next);
        if(previous)setStatus('Previous unfinished photo import restored. Finish or discard it before importing the new photo.');
      }catch(e){if(active)setError(e instanceof Error?e.message:'Could not prepare safe import storage.');}
    })();
    return()=>{active=false;};
  },[]);
  function edit(index:number,patch:Partial<Row>){
    if(!current.current||busy)return;
    const row=current.current.rows[index];if(row.state!=='draft')return;
    try{persist({...current.current,rows:current.current.rows.map((r,i)=>i===index?{...r,...patch}:r)});setError('');}
    catch{setError('Cannot save the review on this device. Free some storage before continuing.');}
  }
  async function save(){
    if(lock.current||!current.current)return;
    lock.current=true;setBusy(true);setError('');
    try{
      await savePhotoBatch(current.current,persist,addProduct,()=>{if(getFirebaseAuth().currentUser?.uid!==ownerUid.current)throw Error('Your login changed. Reload before saving.');});
      setStatus(`${current.current.rows.filter(r=>r.state==='saved').length} products saved.`);
      try{await onSaved?.();}catch{setStatus('Products saved. Reload the catalog to see them; do not import them again.');}
    }catch(e){setError((e instanceof Error?e.message:'Save failed.')+' Already saved rows will not be sent again. Retry keeps the same product IDs.');}
    finally{lock.current=false;setBusy(false);}
  }
  function close(){
    if(current.current?.rows.some(r=>r.state==='pending')){setError('A save result is uncertain. Retry it before discarding this import.');return;}
    try{if(localStorage.getItem(storageKey.current)!==lastRaw.current)throw Error('This import changed in another tab. Reload first.');localStorage.removeItem(storageKey.current);onClose();}catch{setError('Could not clear the saved import.');}
  }
  return <section className="card" aria-label="Review all photo products">
    <h3>{hindi?'फोटो के सभी उत्पाद जाँचें':'Review all photo products'} {batch?`(${batch.rows.length})`:''}</h3>
    <p>{hindi?'हर लाइन का नाम, प्रति यूनिट कीमत, स्टॉक और GST जाँचें। बिना कीमत वाली लाइन पहले सुधारें।':'Check each name, price per unit, stock and GST. Fill missing prices before saving.'}</p>
    <p>No products are added to the current bill automatically. Missing stock/tax start at 0; check these values.</p>
    {!!batch?.unresolved.length&&<div role="alert"><strong>Needs your attention</strong><ul>{batch.unresolved.map((message,index)=><li key={index}>{message}</li>)}</ul></div>}
    {batch?.rows.map((row,index)=><fieldset key={row.id} disabled={busy||row.state!=='draft'} style={{marginBottom:16,padding:12}}>
      <legend>{index+1}. {row.state==='saved'?'Saved':row.state==='pending'?'Pending — retry same details':'Review'}</legend>
      <label><input type="checkbox" checked={row.selected} onChange={e=>edit(index,{selected:e.target.checked})}/> Include</label>
      <label>Name<input className="input" value={row.name} maxLength={160} onChange={e=>edit(index,{name:e.target.value})}/></label>
      <div className="grid-2"><label>Price per unit ₹<input className="input" type="number" min="0" step="0.01" value={row.selling_price??''} onChange={e=>edit(index,{selling_price:e.target.value===''?null:Number(e.target.value)})}/></label>
      <label>Stock<input className="input" type="number" min="0" step="0.001" value={row.stock} onChange={e=>edit(index,{stock:Number(e.target.value)})}/></label>
      <label>Unit<input className="input" maxLength={30} value={row.unit} onChange={e=>edit(index,{unit:e.target.value})}/></label>
      <label>GST %<input className="input" type="number" min="0" max="100" step="0.01" value={row.tax_rate} onChange={e=>edit(index,{tax_rate:Number(e.target.value)})}/></label></div>
      <label><input type="checkbox" checked={row.tax_inclusive} onChange={e=>edit(index,{tax_inclusive:e.target.checked})}/> Price includes GST</label>
    </fieldset>)}
    {error&&<p role="alert" className="form-error">{error}</p>}{status&&<p role="status">{status}</p>}
    <button type="button" className="btn btn-primary" disabled={busy||!batch||!batch.rows.some(r=>r.selected&&r.state!=='saved')} onClick={()=>void save()}>{busy?'Saving…':hindi?'चुने हुए उत्पाद सेव करें':'Save selected products'}</button>
    <button type="button" className="btn" disabled={busy} onClick={close}>Close / discard unsaved rows</button>
  </section>;
}
