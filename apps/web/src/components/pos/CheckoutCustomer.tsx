'use client';
import { useEffect, useRef, useState } from 'react';
import { addCustomer, listCustomers } from '@/lib/pos-api';
import { uiText, usePosLanguage } from '@/lib/pos-language';

type Customer = {id:string;name:string;phone:string|null};
type Speech = {lang:string;onresult:((event:{results:{transcript:string}[][]})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null;start():void;abort():void};

export default function CheckoutCustomer({hindi, disabled, offline=false, onCustomer, onPendingChange, storageKey}:{hindi:boolean;disabled:boolean;offline?:boolean;onCustomer:(customer:Customer)=>void;onPendingChange:(pending:boolean)=>void;storageKey:string|null}) {
  const language=usePosLanguage();
  const tr=(en:string,hi:string,hinglish:string)=>uiText(language,en,hi,hinglish);
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
  useEffect(()=>{onPendingChange(!ready||!!storageError||busy||listening||Boolean(name.trim()||phone.trim()));},[ready,storageError,busy,listening,name,phone,onPendingChange]);
  useEffect(()=>()=>speech.current?.abort(),[]);
  useEffect(()=>{
    if(!storageKey)return;
    try{
      const raw=localStorage.getItem(storageKey);
      if(raw){
        const saved=JSON.parse(raw);
        if(typeof saved.name!=='string'||typeof saved.phone!=='string'||(saved.request&&(!/^[a-f0-9-]{36}$/i.test(saved.request.id)||typeof saved.request.name!=='string')))throw Error('Invalid customer draft');
        setName(saved.name);setPhone(saved.phone);request.current=saved.request??null;
      }
      setReady(true);
    }catch{setStorageError(tr('Customer draft could not be restored. Keep this page open and check your customer list before retrying.','ग्राहक का अधूरा विवरण वापस नहीं खुला। पेज खुला रखें और दोबारा कोशिश से पहले ग्राहक सूची जाँचें।','Customer draft wapas nahi khula. Page khula rakhein aur dobara koshish se pehle customer list dekhein.'));}
  },[storageKey]);
  useEffect(()=>{
    if(!ready||!storageKey)return;
    try{if(name||phone||request.current)localStorage.setItem(storageKey,JSON.stringify({name,phone,request:request.current}));else localStorage.removeItem(storageKey);setStorageError('');}
    catch{setStorageError(tr('Customer details could not be stored safely. Free device storage before saving.','ग्राहक का विवरण सुरक्षित नहीं रखा जा सका। सेव करने से पहले डिवाइस में जगह खाली करें।','Customer details surakshit nahi rakh sake. Save karne se pehle device mein jagah khaali karein.'));}
  },[ready,storageKey,name,phone,busy]);
  function finish(customer:Customer){onCustomer(customer);request.current=null;setName('');setPhone('');setMatches([]);setError('');}
  function listen(field:'name'|'phone') {
    if(offline||disabled||busy)return;
    const browser=window as unknown as {SpeechRecognition?:new()=>Speech;webkitSpeechRecognition?:new()=>Speech};
    const Constructor=browser.SpeechRecognition??browser.webkitSpeechRecognition;
    if(!Constructor){setError(tr('Voice is unavailable here. Please type the details.','यहाँ बोलकर जानकारी देना उपलब्ध नहीं है। जानकारी लिखें।','Yahan voice available nahi hai. Details likhein.'));return;}
    const next=new Constructor();next.lang=language==='en'?'en-IN':'hi-IN';
    next.onresult=event=>{const value=event.results[0]?.[0]?.transcript??'';if(field==='name')setName(value.trim());else setPhone(value.replace(/[०-९]/g,d=>String(d.charCodeAt(0)-0x966)).replace(/[\s().-]/g,''));};
    next.onerror=()=>{setError(tr('Microphone could not hear you. Try again or type.','आवाज़ सुनाई नहीं दी। दोबारा बोलें या लिखें।','Awaaz sunai nahi di. Dobara bolein ya likhein.'));setListening(false);};
    next.onend=()=>setListening(false);speech.current=next;
    try{next.start();setListening(true);setError('');}catch{setError(tr('Could not start microphone.','माइक्रोफ़ोन शुरू नहीं हुआ।','Microphone shuru nahi hua.'));}
  }
  async function save(){
    if(inFlight.current||disabled||offline||listening||!ready||!!storageError||!storageKey)return;
    if(!name.trim()){setError(tr('Enter the customer name.','ग्राहक का नाम लिखें।','Customer ka naam likhein.'));return;}
    const normalized=phone.replace(/[\s().-]/g,'');
    if(normalized&&!/^\+?\d{7,15}$/.test(normalized)){setError(tr('Check the mobile number: use 7–15 digits.','मोबाइल नंबर जाँचें: 7–15 अंक लिखें।','Mobile number check karein: 7–15 ank likhein.'));return;}
    inFlight.current=true;setBusy(true);setError('');setMatches([]);
    try{
      // Reconcile a timed-out create by its stable ID before any retry.
      if(request.current){
        const found=await listCustomers(request.current.phone||request.current.name,true,500);
        const existing=found.data.find(row=>row.id===request.current?.id);
        if(existing){finish(existing as unknown as Customer);return;}
        if(request.current.name!==name.trim()||request.current.phone!==(normalized||null))throw new Error(tr('The previous save is uncertain. Keep its original details and retry before changing this customer.','पिछली बार सेव होने की पुष्टि नहीं हुई। ग्राहक की जानकारी बदलने से पहले उसी विवरण से दोबारा कोशिश करें।','Pichhla save confirm nahi hua. Details badalne se pehle unhi details se dobara koshish karein.'));
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
    }catch(reason){setError(reason instanceof Error?reason.message:tr('Could not save customer. Retry with the same details.','ग्राहक सेव नहीं हुआ। उसी विवरण से दोबारा कोशिश करें।','Customer save nahi hua. Unhi details se dobara koshish karein.'));}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <div className="checkout-customer">
    {storageError&&<p className="form-error" role="alert">{storageError}</p>}
    <fieldset disabled={disabled||busy||!ready} style={{border:0,padding:'12px 0',margin:0}}>
      <p className="muted">{tr('Optional: enter a customer name and mobile number to save and print on the bill. Leave blank for walk-in.','वैकल्पिक: बिल पर ग्राहक का नाम और मोबाइल दिखाने के लिए भरें। Walk-in के लिए खाली छोड़ें।','Optional: bill par customer name aur mobile dikhane ke liye bharein. Walk-in ke liye khaali chhodein.')}</p>
      <div className="field"><label htmlFor="checkout-customer-name">{tr('Customer name','ग्राहक का नाम','Customer ka naam')} *</label><input id="checkout-customer-name" className="input" autoComplete="name" value={name} maxLength={160} readOnly={!!request.current} onChange={e=>{setName(e.target.value);setMatches([]);}}/><button type="button" className="btn" disabled={offline||listening||!!request.current} onClick={()=>listen('name')}>🎤 {tr('Speak name','नाम बोलें','Naam bolein')}</button></div>
      <div className="field"><label htmlFor="checkout-customer-phone">{tr('Mobile number','मोबाइल नंबर','Mobile number')}</label><input id="checkout-customer-phone" className="input" type="tel" autoComplete="tel" maxLength={20} readOnly={!!request.current} value={phone} onChange={e=>{setPhone(e.target.value);setMatches([]);}}/><button type="button" className="btn" disabled={offline||listening||!!request.current} onClick={()=>listen('phone')}>🎤 {tr('Speak number','नंबर बोलें','Number bolein')}</button></div>
      {listening&&<button className="btn" type="button" onClick={()=>{speech.current?.abort();setListening(false);}}>{tr('Stop listening','सुनना रोकें','Sunna rokein')}</button>}
      <p className="muted">{offline?tr('Reconnect to save this customer, or cancel these details to continue.','ग्राहक सेव करने के लिए इंटरनेट जोड़ें, या यह विवरण रद्द करके आगे बढ़ें।','Customer save karne ke liye internet jodein, ya details radd karke aage badhein.'):tr('Check the name and number before selecting this customer.','नाम और नंबर जाँचकर ग्राहक चुनें।','Naam aur number check karke customer chunein.')}</p>
      {error&&<p className="form-error" role="alert">{error}</p>}
      {matches.length>0&&<div><p>{tr('This number already exists. Select the correct customer:','यह नंबर पहले से मौजूद है। सही ग्राहक चुनें:','Yeh number pehle se hai. Sahi customer chunein:')}</p>{matches.map(customer=><button key={customer.id} className="btn" type="button" onClick={()=>finish(customer)}>{customer.name} · {customer.phone}</button>)}</div>}
      <div className="form-actions"><button type="button" className="btn" disabled={listening} onClick={()=>{if(request.current){setError(tr('Previous save is uncertain. Retry once with the same details before clearing.','पिछली बार सेव होने की पुष्टि नहीं हुई। विवरण हटाने से पहले उसी जानकारी से दोबारा कोशिश करें।','Pichhla save confirm nahi hua. Details clear karne se pehle unhi jaankari se dobara koshish karein.'));return;}setName('');setPhone('');setError('');}}>{tr('Clear details','विवरण हटाएँ','Details hatao')}</button><button type="button" className="btn btn-primary" disabled={offline||listening} onClick={()=>void save()}>{busy?tr('Saving…','सेव हो रहा है…','Save ho raha hai…'):tr('Save & select customer','ग्राहक सेव करें और चुनें','Customer save karein aur chunein')}</button></div>
    </fieldset>
  </div>;
}
