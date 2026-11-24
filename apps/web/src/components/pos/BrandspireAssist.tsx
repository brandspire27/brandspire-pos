'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { posText, type PosLanguage } from '@/lib/pos-i18n';
import { uiText } from '@/lib/pos-language';
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
      en:'Open Create Bill → search or scan products → check quantities → select a customer or add their name and phone here → choose payment. Save Only saves the bill. Save & Print saves it and opens your selected printer. Printing never creates a second sale.',
      hi:'बिल बनाएं खोलें → सामान खोजें या स्कैन करें → मात्रा जाँचें → ग्राहक चुनें या यहीं उनका नाम और मोबाइल जोड़ें → भुगतान चुनें। केवल सेव से बिल सेव होता है। सेव + प्रिंट से बिल सेव होकर चुने हुए प्रिंटर पर जाता है। प्रिंट करने से दोबारा बिक्री नहीं बनती।',
      hinglish:'Bill Banao kholo → products search ya scan karo → quantity check karo → customer chuno ya yahin naam aur mobile jodo → payment chuno. Save Only se bill save hoga. Save & Print se bill save hokar selected printer par jayega. Print karne se doosri sale nahi banti.'
    }
  },
  {
    id:'printer', keywords:['printer','print','58','80','thermal','bluetooth','usb','प्रिंटर','print nahi','receipt'],
    q:{en:'How do I print a bill?',hi:'बिल कैसे प्रिंट करें?',hinglish:'Bill print kaise karu?'},
    a:{
      en:'Before Save & Print, choose SC03h Bluetooth or System printer / PDF. SC03h needs Chrome/Edge on Windows or Chrome on Android; choose your printer when asked. For an existing bill, open View Receipt and use its print button. If output is partial, check the paper before retrying. Other browser printers use the installed system driver.',
      hi:'सेव + प्रिंट से पहले SC03h Bluetooth या सिस्टम प्रिंटर / PDF चुनें। SC03h के लिए Windows पर Chrome/Edge या Android पर Chrome चाहिए; पूछे जाने पर अपना प्रिंटर चुनें। पुराने बिल के लिए रसीद खोलकर प्रिंट करें। अधूरा प्रिंट आए तो दोबारा प्रिंट से पहले कागज़ जाँचें। दूसरे ब्राउज़र प्रिंटर सिस्टम के ड्राइवर से चलते हैं।',
      hinglish:'Save & Print se pehle SC03h Bluetooth ya System printer / PDF chuno. SC03h ke liye Windows par Chrome/Edge ya Android par Chrome chahiye; poochhe jaane par apna printer chuno. Purane bill ki receipt kholkar print karo. Adhura print aaye to dobara print se pehle paper check karo. Doosre browser printers system driver se chalte hain.'
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
      en:'While making a bill, use Add customer here / speak. Type or speak the name and phone, check them, then Save & select customer. You can also add phone, GSTIN, state and address from Customers. Staff can add/search customers but cannot delete them.',
      hi:'बिल बनाते समय यहीं ग्राहक जोड़ें / बोलें चुनें। नाम और मोबाइल लिखें या बोलें, जाँचें, फिर ग्राहक सेव और चुनें दबाएँ। ग्राहक पेज से फोन, GSTIN, राज्य और पता भी जोड़ सकते हैं। स्टाफ ग्राहक जोड़ या खोज सकता है, हटा नहीं सकता।',
      hinglish:'Bill banate waqt Yahin customer jodo / bolo chuno. Naam aur mobile likho ya bolo, check karo, phir Save & select customer dabao. Customers page se phone, GSTIN, state aur address bhi jod sakte ho. Staff add/search kar sakta hai, delete nahi.'
    }
  },
  {
    id:'product', keywords:['product','item','sku','barcode','hsn','प्रोडक्ट','stock add'],
    q:{en:'How do I add a product?',hi:'प्रोडक्ट कैसे जोड़ें?',hinglish:'Product kaise add karu?'},
    a:{
      en:'Use New product while billing, or open Products. Enter the name, selling price, stock and GST, then save. You can speak, take a photo or scan a barcode; check every suggested product and price before saving. Online barcode names are suggestions and may not be available for every product.',
      hi:'बिल बनाते समय नया प्रोडक्ट चुनें या प्रोडक्ट पेज खोलें। नाम, बिक्री मूल्य, स्टॉक और GST भरकर सेव करें। बोलकर, फोटो लेकर या बारकोड स्कैन करके भी भर सकते हैं; सेव से पहले हर सुझाया सामान और कीमत जाँचें। ऑनलाइन बारकोड से हर सामान का नाम मिलना तय नहीं है।',
      hinglish:'Billing mein Naya product chuno ya Products page kholo. Naam, selling price, stock aur GST bharkar save karo. Bolkar, photo lekar ya barcode scan karke bhi bhar sakte ho; save se pehle har suggested product aur price check karo. Online barcode se har product ka naam milna guaranteed nahi hai.'
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
      en:'While online, open billing and prepare offline billing on this device before losing internet. The prepared web copy supports saved products/customers for up to 24 hours. Save Only queues cash/credit bills on this device; reconnect and Sync before the next online sale. Keep browser data intact. Online AI, new products/customers and web invoice printing need internet. This basic help works after the app is loaded.',
      hi:'इंटरनेट रहते बिलिंग खोलें और इसी डिवाइस पर ऑफलाइन तैयार करें। तैयार वेब कॉपी में सेव किया सामान और ग्राहक 24 घंटे तक उपलब्ध रहते हैं। केवल सेव से नकद/उधार बिल इसी डिवाइस पर लंबित रहते हैं; इंटरनेट आने पर अगली ऑनलाइन बिक्री से पहले सिंक करें। ब्राउज़र का डेटा न मिटाएँ। ऑनलाइन AI, नए सामान/ग्राहक और वेब बिल प्रिंट के लिए इंटरनेट चाहिए। ऐप खुलने के बाद यह सामान्य मदद उपलब्ध रहती है।',
      hinglish:'Internet rehte billing kholo aur isi device par offline taiyar karo. Taiyar web copy mein saved products/customers 24 ghante tak milte hain. Save Only cash/credit bill isi device par pending rakhta hai; internet aane par agli online sale se pehle Sync karo. Browser data mat mitao. Online AI, naye products/customers aur web invoice print ke liye internet chahiye. App load hone ke baad basic help chalti hai.'
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
  const [mode,setMode]=useState<'offline'|'online'>(role==='OWNER'?'online':'offline');
  const [query,setQuery]=useState('');
  const [answer,setAnswer]=useState('');
  const [onlineBusy,setOnlineBusy]=useState(false);
  const [onlineError,setOnlineError]=useState('');
  useEffect(()=>{setAnswer('');setOnlineError('');},[language]);

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
    if(!navigator.onLine){setOnlineError(uiText(language,'No internet. Select Offline Help for basic guidance.','इंटरनेट नहीं है। सामान्य जानकारी के लिए ऑफलाइन मदद चुनें।','Internet nahi hai. Basic help ke liye Offline Help chuno.'));return;}
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
    <button type="button" className="assist-fab no-print" onClick={()=>setOpen(true)} aria-label={t.assist} title={t.assist}><span aria-hidden="true">?</span><b>{t.assist}</b><small>{role==='OWNER'?uiText(language,'AI + Help','AI और मदद','AI + Madad'):t.offlineHelp}</small></button>
    {open&&<div className="assist-backdrop no-print" onMouseDown={(e)=>{if(e.target===e.currentTarget)setOpen(false);}}>
      <aside className="assist-panel" role="dialog" aria-modal="true" aria-label={t.assist}>
        <div className="assist-head"><div><span className="assist-logo">BP</span><div><strong>{t.assist}</strong><small>{role==='OWNER'?p8.ownerAssistHead:t.offlineHelp}</small></div></div><button className="assist-close" onClick={()=>setOpen(false)} aria-label={t.close}>×</button></div>
        {role==='OWNER'&&<div className="assist-mode-tabs"><button aria-pressed={mode==='offline'} className={mode==='offline'?'active':''} onClick={()=>{setMode('offline');setAnswer('');setOnlineError('');}}>{p8.offlineMode}</button><button aria-pressed={mode==='online'} className={mode==='online'?'active':''} onClick={()=>{setMode('online');setAnswer('');setOnlineError('');}}>{p8.onlineInsights}</button></div>}
        <p className="assist-intro">{mode==='online'&&role==='OWNER'?p8.onlineInsightsSub:t.assistIntro}</p>
        {mode==='offline'&&<div className="assist-quick">{quick.map((item)=><button key={item.id} onClick={()=>{setQuery(item.q[language]);setAnswer(item.a[language]);}}>{item.q[language]}</button>)}</div>}
        {onlineError&&<div className="assist-warning" role="alert"><strong>{uiText(language,'Online AI is unavailable right now','ऑनलाइन AI अभी उपलब्ध नहीं है','Online AI abhi available nahi hai')}</strong><span>{onlineError}</span></div>}
        {answer&&<div className="assist-answer"><span>BP</span><p>{answer}</p></div>}
        <form className="assist-form" onSubmit={submit}><input aria-label={uiText(language,'Your question','आपका सवाल','Aapka sawaal')} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={mode==='online'&&role==='OWNER'?p8.askBusiness:t.assistPlaceholder}/><button type="submit" title={uiText(language,'Send question','सवाल भेजें','Sawaal bhejo')} aria-label={uiText(language,onlineBusy?'Getting answer':'Send question',onlineBusy?'जवाब आ रहा है':'सवाल भेजें',onlineBusy?'Jawab aa raha hai':'Sawaal bhejo')} disabled={onlineBusy}>{onlineBusy?'…':'→'}</button></form>
        <div className="assist-foot"><span>{mode==='online'&&role==='OWNER'?p8.controlledToolsFoot:p8.offlineFoot}</span>{(query||answer||onlineError)&&<button onClick={()=>{setQuery('');setAnswer('');setOnlineError('');}}>{t.clear}</button>}</div>
      </aside>
    </div>}
  </>;
}
