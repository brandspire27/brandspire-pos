'use client';

import { FormEvent, useMemo, useState } from 'react';
import { posText, type PosLanguage } from '@/lib/pos-i18n';
import { phase8Text } from '@/lib/phase8-i18n';
import { askBusinessInsights } from '@/lib/owner-api';

type Role = 'OWNER' | 'STAFF';
type Props = { language: PosLanguage; role: Role };
type HelpItem = { id:string; keywords:string[]; ownerOnly?:boolean; q:Record<PosLanguage,string>; a:Record<PosLanguage,string> };

const helpItems: HelpItem[] = [
  {
    id:'bill', keywords:['bill','invoice','billing','बिल','banao','banana','create'],
    q:{en:'How do I create a bill?',hi:'बिल कैसे बनाएं?',hinglish:'Bill kaise banao?'},
    a:{
      en:'Open Create Bill → search or scan a product → choose quantity → select a customer if needed → choose payment method → tap Create Bill. The bill is saved before printing.',
      hi:'बिल बनाएं खोलें → प्रोडक्ट खोजें या स्कैन करें → मात्रा चुनें → जरूरत हो तो ग्राहक चुनें → भुगतान तरीका चुनें → बिल बनाएं दबाएं। प्रिंट से पहले बिल सेव हो जाता है।',
      hinglish:'Bill Banao open karo → product search ya scan karo → quantity choose karo → zarurat ho to customer select karo → payment method choose karo → Bill Banao dabao. Print se pehle bill save ho jata hai.'
    }
  },
  {
    id:'printer', keywords:['printer','print','58','80','thermal','bluetooth','usb','प्रिंटर','print nahi','receipt'],
    q:{en:'How do I print a bill?',hi:'बिल कैसे प्रिंट करें?',hinglish:'Bill print kaise karu?'},
    a:{
      en:'Open the bill → View / Print → choose 58mm, 80mm or A4. On desktop, use the installed printer driver. On Android, compatible Bluetooth/USB thermal printers use the local printer bridge.',
      hi:'बिल खोलें → देखें / प्रिंट करें → 58mm, 80mm या A4 चुनें। डेस्कटॉप पर इंस्टॉल किया हुआ प्रिंटर ड्राइवर उपयोग करें। Android पर compatible Bluetooth/USB thermal printer local printer bridge से चलेगा।',
      hinglish:'Bill open karo → View / Print → 58mm, 80mm ya A4 choose karo. Desktop par installed printer driver use hoga. Android par compatible Bluetooth/USB thermal printer local printer bridge se chalega.'
    }
  },
  {
    id:'due', keywords:['due','payment','pending','baaki','बाकी','बकाया','collect','receive','partial'],
    q:{en:'How do I receive a pending payment?',hi:'बकाया भुगतान कैसे लें?',hinglish:'Pending payment kaise receive karu?'},
    a:{
      en:'Owner: open Dues & Payments → select the pending invoice → enter the amount → choose Cash, UPI, Card or Other → Record Payment. Partial payments are supported.',
      hi:'ओनर: बकाया और भुगतान खोलें → लंबित बिल चुनें → राशि डालें → Cash, UPI, Card या Other चुनें → भुगतान दर्ज करें। आंशिक भुगतान भी किया जा सकता है।',
      hinglish:'Owner: Baaki & Payments open karo → pending invoice select karo → amount enter karo → Cash, UPI, Card ya Other choose karo → Payment Record Karo. Partial payment supported hai.'
    }, ownerOnly:true
  },
  {
    id:'customer', keywords:['customer','ग्राहक','cust','add customer','customer add'],
    q:{en:'How do I add a customer?',hi:'ग्राहक कैसे जोड़ें?',hinglish:'Customer kaise add karu?'},
    a:{
      en:'Open Customers → Add Customer → enter the name and any useful phone, GSTIN, state or address → Save Customer. Staff can add/search customers but cannot delete them.',
      hi:'ग्राहक खोलें → ग्राहक जोड़ें → नाम और जरूरत के अनुसार फोन, GSTIN, राज्य या पता भरें → ग्राहक सेव करें। स्टाफ ग्राहक जोड़/खोज सकता है, डिलीट नहीं।',
      hinglish:'Customers open karo → Customer Add Karo → name aur zarurat ke hisaab se phone, GSTIN, state ya address fill karo → Customer Save Karo. Staff add/search kar sakta hai, delete nahi.'
    }
  },
  {
    id:'product', keywords:['product','item','sku','barcode','hsn','प्रोडक्ट','stock add'],
    q:{en:'How do I add a product?',hi:'प्रोडक्ट कैसे जोड़ें?',hinglish:'Product kaise add karu?'},
    a:{
      en:'Open Products → Add Product → enter product name, selling price, GST, opening stock and optional SKU/barcode/HSN → Save Product.',
      hi:'प्रोडक्ट खोलें → प्रोडक्ट जोड़ें → नाम, बिक्री मूल्य, GST, शुरुआती स्टॉक और जरूरत हो तो SKU/barcode/HSN भरें → प्रोडक्ट सेव करें।',
      hinglish:'Products open karo → Product Add Karo → name, selling price, GST, opening stock aur optional SKU/barcode/HSN fill karo → Product Save Karo.'
    }
  },
  {
    id:'stock', keywords:['inventory','stock','stock in','stock out','इन्वेंटरी','स्टॉक','adjust'], ownerOnly:true,
    q:{en:'How do I adjust stock?',hi:'स्टॉक कैसे बदलें?',hinglish:'Stock kaise adjust karu?'},
    a:{
      en:'Owner: open Inventory → select a product → choose Stock In or Stock Out → enter quantity and reason → save. Every manual adjustment is recorded in movement history.',
      hi:'ओनर: इन्वेंटरी खोलें → प्रोडक्ट चुनें → Stock In या Stock Out चुनें → मात्रा और कारण भरें → सेव करें। हर manual adjustment movement history में रिकॉर्ड होता है।',
      hinglish:'Owner: Inventory open karo → product select karo → Stock In ya Stock Out choose karo → quantity aur reason enter karo → save karo. Har manual adjustment movement history mein record hota hai.'
    }
  },
  {
    id:'staff', keywords:['staff','employee','worker','स्टाफ','account'], ownerOnly:true,
    q:{en:'How do I add Staff?',hi:'स्टाफ कैसे जोड़ें?',hinglish:'Staff kaise add karu?'},
    a:{
      en:'Owner: open Staff → enter Staff name, email, mobile and temporary password → Create Staff Account. Staff can add customers/products and create bills, but cannot manage settings or delete records.',
      hi:'ओनर: स्टाफ खोलें → नाम, ईमेल, मोबाइल और अस्थायी पासवर्ड भरें → स्टाफ अकाउंट बनाएं। स्टाफ ग्राहक/प्रोडक्ट जोड़ और बिल बना सकता है, लेकिन सेटिंग्स मैनेज या रिकॉर्ड डिलीट नहीं कर सकता।',
      hinglish:'Owner: Staff open karo → name, email, mobile aur temporary password enter karo → Staff Account Banao. Staff customer/product add aur bill create kar sakta hai, settings manage ya records delete nahi.'
    }
  },
  {
    id:'language', keywords:['language','hindi','hinglish','english','भाषा'], ownerOnly:true,
    q:{en:'How do I change language?',hi:'भाषा कैसे बदलें?',hinglish:'Language kaise change karu?'},
    a:{
      en:'Owner: Settings → Language & Billing → choose English, Hinglish or Hindi → Save Settings. The workspace will use the selected language.',
      hi:'ओनर: सेटिंग्स → भाषा और बिलिंग → English, Hinglish या Hindi चुनें → सेटिंग्स सेव करें। पूरा वर्कस्पेस चुनी हुई भाषा उपयोग करेगा।',
      hinglish:'Owner: Settings → Language & Billing → English, Hinglish ya Hindi choose karo → Settings Save Karo. Workspace selected language use karega.'
    }
  },
  {
    id:'offline', keywords:['offline','internet','network','connection','बिना इंटरनेट','नेट'],
    q:{en:'What works without internet?',hi:'बिना इंटरनेट क्या काम करेगा?',hinglish:'Offline mein kya chalega?'},
    a:{
      en:'This Brandspire Assist help works offline after the app is loaded. Full offline billing/sync is being built for the Android app; the web app still needs internet for live database operations.',
      hi:'यह Brandspire Assist सहायता app load होने के बाद offline काम करती है। Android app के लिए full offline billing/sync बन रही है; web app को live database काम के लिए अभी इंटरनेट चाहिए।',
      hinglish:'Ye Brandspire Assist help app load hone ke baad offline chalti hai. Android app ke liye full offline billing/sync build ho raha hai; web app ko live database operations ke liye abhi internet chahiye.'
    }
  }
];

function normalize(value:string) {
  return value.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g,' ').replace(/\s+/g,' ').trim();
}

export default function BrandspireAssist({ language, role }: Props) {
  const t = posText(language);
  const p8 = phase8Text(language);
  const available = useMemo(() => helpItems.filter((item) => role === 'OWNER' || !item.ownerOnly), [role]);
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<'offline'|'online'>('offline');
  const [query,setQuery]=useState('');
  const [answer,setAnswer]=useState('');
  const [onlineBusy,setOnlineBusy]=useState(false);
  const [onlineError,setOnlineError]=useState('');

  function askOffline(raw:string){
    const q=normalize(raw);
    if(!q){setAnswer('');return;}
    const scored=available.map((item)=>({item,score:item.keywords.reduce((score,keyword)=>score+(q.includes(normalize(keyword))?1:0),0)})).sort((a,b)=>b.score-a.score);
    const match=scored[0];
    setAnswer(match&&match.score>0?match.item.a[language]:t.assistNoMatch);
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    setOnlineError('');
    if(mode==='offline'||role!=='OWNER'){askOffline(query);return;}
    if(!query.trim())return;
    setOnlineBusy(true);setAnswer('');
    try{
      const response=await askBusinessInsights(query.trim());
      if(!response.data.configured){setOnlineError(response.data.message||p8.aiUnavailable);}
      else setAnswer(response.data.answer||p8.aiUnavailable);
    }catch(error){setOnlineError(error instanceof Error?error.message:p8.aiUnavailable);}
    finally{setOnlineBusy(false);}
  }
  const quick = available.slice(0,4);

  return <>
    <button type="button" className="assist-fab no-print" onClick={()=>setOpen(true)} aria-label={t.assist}><span>?</span><b>{t.assist}</b><small>{mode==='online'&&role==='OWNER'?'Online + Offline':t.offlineHelp}</small></button>
    {open&&<div className="assist-backdrop no-print" onMouseDown={(e)=>{if(e.target===e.currentTarget)setOpen(false);}}>
      <aside className="assist-panel" role="dialog" aria-modal="true" aria-label={t.assist}>
        <div className="assist-head"><div><span className="assist-logo">BP</span><div><strong>{t.assist}</strong><small>{role==='OWNER'?p8.ownerAssistHead:t.offlineHelp}</small></div></div><button className="assist-close" onClick={()=>setOpen(false)} aria-label={t.close}>×</button></div>
        {role==='OWNER'&&<div className="assist-mode-tabs"><button className={mode==='offline'?'active':''} onClick={()=>{setMode('offline');setAnswer('');setOnlineError('');}}>{p8.offlineMode}</button><button className={mode==='online'?'active':''} onClick={()=>{setMode('online');setAnswer('');setOnlineError('');}}>{p8.onlineInsights}</button></div>}
        <p className="assist-intro">{mode==='online'&&role==='OWNER'?p8.onlineInsightsSub:t.assistIntro}</p>
        {mode==='offline'&&<div className="assist-quick">{quick.map((item)=><button key={item.id} onClick={()=>{setQuery(item.q[language]);setAnswer(item.a[language]);}}>{item.q[language]}</button>)}</div>}
        {onlineError&&<div className="assist-warning"><strong>{p8.aiUnavailable}</strong><span>{onlineError}</span></div>}
        {answer&&<div className="assist-answer"><span>BP</span><p>{answer}</p></div>}
        <form className="assist-form" onSubmit={submit}><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={mode==='online'&&role==='OWNER'?p8.askBusiness:t.assistPlaceholder}/><button type="submit" disabled={onlineBusy}>{onlineBusy?'…':'→'}</button></form>
        <div className="assist-foot"><span>{mode==='online'&&role==='OWNER'?p8.controlledToolsFoot:p8.offlineFoot}</span>{(query||answer||onlineError)&&<button onClick={()=>{setQuery('');setAnswer('');setOnlineError('');}}>{t.clear}</button>}</div>
      </aside>
    </div>}
  </>;
}
