'use client';
import { useEffect, useRef, useState } from 'react';
import { addCustomer, listCustomers } from '@/lib/pos-api';

type Customer = {id:string;name:string;phone:string|null};
type Speech = {lang:string;onresult:((event:{results:{transcript:string}[][]})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null;start():void;abort():void};

export default function CheckoutCustomer({hindi, disabled, onCustomer, onPendingChange, storageKey}:{hindi:boolean;disabled:boolean;onCustomer:(customer:Customer)=>void;onPendingChange:(pending:boolean)=>void;storageKey:string|null}) {
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [busy,setBusy]=useState(false);
  const [listening,setListening]=useState(false);
  const [error,setError]=useState('');
  const [matches,setMatches]=useState<Customer[]>([]);
  const [ready,setReady]=useState(false);
  const [storageError,setStorageError]=useState('');
  const speech=useRef<Speech|null>(null);
  const inFlight=useRef(false);
  const request=useRef<{id:string;name:string;phone:string|null}|null>(null);
  useEffect(()=>{onPendingChange(!ready||!!storageError||busy||listening||Boolean(open&&(name.trim()||phone.trim())));},[ready,storageError,busy,listening,open,name,phone,onPendingChange]);
  useEffect(()=>()=>speech.current?.abort(),[]);
  useEffect(()=>{
    if(!storageKey)return;
    try{
      const raw=localStorage.getItem(storageKey);
      if(raw){
        const saved=JSON.parse(raw);
        if(typeof saved.name!=='string'||typeof saved.phone!=='string'||(saved.request&&(!/^[a-f0-9-]{36}$/i.test(saved.request.id)||typeof saved.request.name!=='string')))throw Error('Invalid customer draft');
        setName(saved.name);setPhone(saved.phone);request.current=saved.request??null;setOpen(true);
      }
      setReady(true);
    }catch{setStorageError('Customer draft could not be restored. Keep this page open and check your customer list before retrying.');}
  },[storageKey]);
  useEffect(()=>{
    if(!ready||!storageKey)return;
    try{if(name||phone||request.current)localStorage.setItem(storageKey,JSON.stringify({name,phone,request:request.current}));else localStorage.removeItem(storageKey);setStorageError('');}
    catch{setStorageError('Customer details could not be stored safely. Free device storage before saving.');}
  },[ready,storageKey,name,phone,busy]);
  function finish(customer:Customer){onCustomer(customer);request.current=null;setName('');setPhone('');setOpen(false);setMatches([]);setError('');}
  function listen(field:'name'|'phone') {
    const browser=window as unknown as {SpeechRecognition?:new()=>Speech;webkitSpeechRecognition?:new()=>Speech};
    const Constructor=browser.SpeechRecognition??browser.webkitSpeechRecognition;
    if(!Constructor){setError('Voice is unavailable here. Please type the details.');return;}
    const next=new Constructor();next.lang=hindi?'hi-IN':'en-IN';
    next.onresult=event=>{const value=event.results[0]?.[0]?.transcript??'';if(field==='name')setName(value.trim());else setPhone(value.replace(/[०-९]/g,d=>String(d.charCodeAt(0)-0x966)).replace(/[\s().-]/g,''));};
    next.onerror=()=>{setError('Microphone could not hear you. Try again or type.');setListening(false);};
    next.onend=()=>setListening(false);speech.current=next;
    try{next.start();setListening(true);setError('');}catch{setError('Could not start microphone.');}
  }
  async function save(){
    if(inFlight.current||disabled||listening||!ready||!!storageError||!storageKey)return;
    if(!name.trim()){setError('Enter the customer name.');return;}
    const normalized=phone.replace(/[\s().-]/g,'');
    if(normalized&&!/^\+?\d{7,15}$/.test(normalized)){setError('Check the mobile number: use 7–15 digits.');return;}
    inFlight.current=true;setBusy(true);setError('');setMatches([]);
    try{
      // Reconcile a timed-out create by its stable ID before any retry.
      if(request.current){
        const found=await listCustomers(request.current.phone||request.current.name,true,500);
        const existing=found.data.find(row=>row.id===request.current?.id);
        if(existing){finish(existing as unknown as Customer);return;}
        if(request.current.name!==name.trim()||request.current.phone!==(normalized||null))throw new Error('The previous save is uncertain. Keep its original details and retry before changing this customer.');
      }
      if(normalized){
        const result=await listCustomers(normalized,true,100);
        const exact=result.data.filter(row=>String(row.phone??'').replace(/[\s().-]/g,'')===normalized) as unknown as Customer[];
        if(exact.length){setMatches(exact);return;}
      }
      request.current??={id:crypto.randomUUID(),name:name.trim(),phone:normalized||null};
      localStorage.setItem(storageKey,JSON.stringify({name,phone,request:request.current}));
      const result=await addCustomer(request.current);
      finish({...request.current,id:result.data.id});
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not save customer. Retry with the same details.');}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <div className="checkout-customer">
    <button type="button" className="btn" disabled={disabled||busy||listening} aria-expanded={open} onClick={()=>setOpen(true)}>+ {hindi?'यहीं ग्राहक जोड़ें / बोलें':'Add customer here / speak'}</button>
    {storageError&&<p className="form-error" role="alert">{storageError}</p>}
    {open&&<fieldset disabled={disabled||busy||!ready} style={{border:0,padding:'12px 0',margin:0}}>
      <div className="field"><label htmlFor="checkout-customer-name">{hindi?'ग्राहक का नाम':'Customer name'} *</label><input id="checkout-customer-name" className="input" autoComplete="name" value={name} maxLength={160} readOnly={!!request.current} onChange={e=>{setName(e.target.value);setMatches([]);}}/><button type="button" className="btn" disabled={listening||!!request.current} onClick={()=>listen('name')}>🎤 {hindi?'नाम बोलें':'Speak name'}</button></div>
      <div className="field"><label htmlFor="checkout-customer-phone">{hindi?'मोबाइल नंबर':'Mobile number'}</label><input id="checkout-customer-phone" className="input" type="tel" autoComplete="tel" maxLength={20} readOnly={!!request.current} value={phone} onChange={e=>{setPhone(e.target.value);setMatches([]);}}/><button type="button" className="btn" disabled={listening||!!request.current} onClick={()=>listen('phone')}>🎤 {hindi?'नंबर बोलें':'Speak number'}</button></div>
      {listening&&<button className="btn" type="button" onClick={()=>{speech.current?.abort();setListening(false);}}>Stop listening</button>}
      <p className="muted">{hindi?'नाम और नंबर जाँचकर ग्राहक चुनें।':'Check the name and number before selecting this customer.'}</p>
      {error&&<p className="form-error" role="alert">{error}</p>}
      {matches.length>0&&<div><p>This number already exists. Select the correct customer:</p>{matches.map(customer=><button key={customer.id} className="btn" type="button" onClick={()=>finish(customer)}>{customer.name} · {customer.phone}</button>)}</div>}
      <div className="form-actions"><button type="button" className="btn" disabled={listening} onClick={()=>{if(request.current){setError('Previous save is uncertain. Retry once with the same details before closing.');return;}setName('');setPhone('');setOpen(false);setError('');}}>Cancel</button><button type="button" className="btn btn-primary" disabled={listening} onClick={()=>void save()}>{busy?'Saving…':hindi?'ग्राहक सेव और चुनें':'Save & select customer'}</button></div>
    </fieldset>}
  </div>;
}
