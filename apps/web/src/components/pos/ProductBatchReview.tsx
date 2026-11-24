'use client';

import {useEffect,useRef,useState} from 'react';
import {addProduct} from '@/lib/pos-api';
import {getCurrentOrganization} from '@/lib/pos';
import {getFirebaseAuth} from '@/lib/firebase';
import {usePosLanguage,uiText} from '@/lib/pos-language';

import {photoBatchKey,readPhotoBatch,savePhotoBatch,validPhotoProduct,type PhotoProductRow as Row,type PhotoProductBatch as Batch} from '@/lib/product-photo-batch';

export default function ProductBatchReview({products,unresolved,onSaved,onClose}:{products:Record<string,unknown>[];unresolved:string[];onSaved?:()=>void|Promise<void>;onClose:()=>void}) {
  const language = usePosLanguage();
  const t = (en:string,hi:string,hinglish:string) => uiText(language,en,hi,hinglish);
  const [batch,setBatch]=useState<Batch|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const lock=useRef(false);
  const storageKey=useRef('');
  const ownerUid=useRef('');
  const lastRaw=useRef<string|null>(null);
  const current=useRef<Batch|null>(null);
  function persist(next:Batch){if(localStorage.getItem(storageKey.current)!==lastRaw.current)throw Error(t('This import changed in another tab. Reload to continue safely.','यह सूची दूसरे टैब में बदल गई है। सुरक्षित रूप से आगे बढ़ने के लिए पेज फिर खोलें।','Yeh list doosre tab mein badli hai. Safe tarike se aage badhne ke liye page reload karein.'));const raw=JSON.stringify(next);localStorage.setItem(storageKey.current,raw);lastRaw.current=raw;current.current=next;setBatch(next);}
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const org=await getCurrentOrganization();const uid=getFirebaseAuth().currentUser?.uid;
        if(!org||!uid)throw Error(t('Sign in before reviewing products.','उत्पाद जाँचने से पहले लॉगिन करें।','Products check karne se pehle login karein.'));
        const key=photoBatchKey(uid,org.organizationId);
        const saved=localStorage.getItem(key);
        let previous:Batch|null=null;
        if(saved){try{previous=readPhotoBatch(saved);}catch{throw Error(t('Saved photo import could not be read. Keep device data and check your product history before importing again.','सेव की हुई फोटो सूची नहीं पढ़ी जा सकी। डिवाइस का डेटा न हटाएँ और दोबारा जोड़ने से पहले उत्पादों का इतिहास जाँचें।','Save ki hui photo list padhi nahi ja saki. Device data na hatayein aur dobara import karne se pehle product history check karein.'));}}
        const next=previous??{rows:products.map(p=>({id:crypto.randomUUID(),name:String(p.name??''),selling_price:p.selling_price==null?null:Number(p.selling_price),stock:Number(p.stock??0),unit:String(p.unit??'pcs'),tax_rate:Number(p.tax_rate??0),tax_inclusive:Boolean(p.tax_inclusive),selected:true,state:'draft' as const})),unresolved};
        if(!active)return;
        storageKey.current=key;ownerUid.current=uid;lastRaw.current=saved;persist(next);
        if(previous)setStatus(t('Previous unfinished photo import restored. Finish or discard it before importing the new photo.','पिछली अधूरी फोटो की सूची वापस मिल गई है। नई फोटो जोड़ने से पहले इसे पूरा या रद्द करें।','Pichhli adhoori photo ki list wapas mil gayi hai. Nayi photo jodne se pehle ise poora ya radd karein.'));
      }catch(e){if(active)setError(e instanceof Error?e.message:t('Could not prepare safe import storage.','सूची को सुरक्षित रखने की जगह तैयार नहीं हुई।','List ko safe rakhne ke liye storage taiyar nahi hua.'));}
    })();
    return()=>{active=false;};
  },[]);
  function edit(index:number,patch:Partial<Row>){
    if(!current.current||busy)return;
    const row=current.current.rows[index];if(row.state!=='draft')return;
    try{persist({...current.current,rows:current.current.rows.map((r,i)=>i===index?{...r,...patch}:r)});setError('');}
    catch{setError(t('Cannot save the review on this device. Free some storage before continuing.','इस डिवाइस पर सूची सेव नहीं हो रही है। आगे बढ़ने से पहले कुछ जगह खाली करें।','Is device par list save nahi ho rahi. Aage badhne se pehle kuch storage khaali karein.'));}
  }
  async function save(){
    if(lock.current||!current.current)return;
    lock.current=true;setBusy(true);setError('');
    try{
      if(current.current.rows.some(row=>row.selected&&row.state!=='saved'&&!validPhotoProduct(row)))throw Error(t('Enter a name, price, valid stock, unit and GST for every selected row.','हर चुनी हुई पंक्ति में नाम, कीमत, सही स्टॉक, इकाई और GST भरें।','Har chuni hui line mein naam, price, sahi stock, unit aur GST bharein.'));
      await savePhotoBatch(current.current,persist,addProduct,()=>{if(getFirebaseAuth().currentUser?.uid!==ownerUid.current)throw Error(t('Your login changed. Reload before saving.','आपका लॉगिन बदल गया है। सेव करने से पहले पेज फिर खोलें।','Aapka login badal gaya hai. Save karne se pehle page reload karein.'));});
      setStatus(`${current.current.rows.filter(r=>r.state==='saved').length} ${t('products saved.','उत्पाद सेव हुए।','products save hue.')}`);
      try{await onSaved?.();}catch{setStatus(t('Products saved. Reload the catalog to see them; do not import them again.','उत्पाद सेव हो गए। देखने के लिए कैटलॉग फिर खोलें; इन्हें दोबारा न जोड़ें।','Products save ho gaye. Dekhne ke liye catalog reload karein; inhein dobara na jodein.'));}
    }catch(e){setError((e instanceof Error?e.message:t('Save failed.','सेव नहीं हुआ।','Save nahi hua.'))+t(' Already saved rows will not be sent again. Retry keeps the same product IDs.',' सेव हुई पंक्तियाँ दोबारा नहीं भेजी जाएँगी। फिर कोशिश करने पर उन्हीं उत्पाद पहचान संख्याओं का इस्तेमाल होगा।',' Save hui lines dobara nahi bheji jayengi. Phir koshish karne par wahi product IDs rahengi.'));}
    finally{lock.current=false;setBusy(false);}
  }
  function close(){
    if(current.current?.rows.some(r=>r.state==='pending')){setError(t('A save result is uncertain. Retry it before discarding this import.','एक उत्पाद के सेव होने की पुष्टि नहीं हुई। सूची रद्द करने से पहले फिर कोशिश करें।','Ek product save hua ya nahi, confirm nahi hai. List radd karne se pehle phir koshish karein.'));return;}
    try{if(localStorage.getItem(storageKey.current)!==lastRaw.current)throw Error(t('This import changed in another tab. Reload first.','यह सूची दूसरे टैब में बदल गई है। पहले पेज फिर खोलें।','Yeh list doosre tab mein badli hai. Pehle page reload karein.'));localStorage.removeItem(storageKey.current);onClose();}catch{setError(t('Could not clear the saved import.','सेव की हुई सूची हटाई नहीं जा सकी।','Save ki hui list hatayi nahi ja saki.'));}
  }
  return <section className="card" aria-label={t('Review all photo products','फोटो के सभी उत्पाद जाँचें','Photo ke sabhi products check karein')}>
    <h3>{t('Review all photo products','फोटो के सभी उत्पाद जाँचें','Photo ke sabhi products check karein')} {batch?`(${batch.rows.length})`:''}</h3>
    <p>{t('Check each name, price per unit, stock and GST. Fill missing prices before saving.','हर पंक्ति का नाम, प्रति इकाई कीमत, स्टॉक और GST जाँचें। सेव करने से पहले खाली कीमतें भरें।','Har line ka naam, unit ka price, stock aur GST check karein. Save karne se pehle khaali prices bharein.')}</p>
    <p>{t('Products are saved to the catalog, not added to the current bill. Missing stock and tax start at 0; check these values.','उत्पाद कैटलॉग में सेव होंगे, इस बिल में नहीं जुड़ेंगे। जहाँ स्टॉक और टैक्स नहीं मिला, वहाँ 0 है; ये संख्याएँ जाँचें।','Products catalog mein save honge, is bill mein nahi judenge. Jahan stock aur tax nahi mila, wahan 0 hai; yeh numbers check karein.')}</p>
    {!!batch?.unresolved.length&&<div role="alert"><strong>{t('Needs your attention','यह जाँचना बाकी है','Yeh check karna baaki hai')}</strong><ul>{batch.unresolved.map((message,index)=><li key={index}>{message}</li>)}</ul></div>}
    {batch?.rows.map((row,index)=><fieldset key={row.id} disabled={busy||row.state!=='draft'} style={{marginBottom:16,padding:12}}>
      <legend>{index+1}. {row.state==='saved'?t('Saved','सेव हुआ','Save hua'):row.state==='pending'?t('Pending — retry same details','पुष्टि बाकी — इन्हीं जानकारियों से फिर कोशिश करें','Confirmation baaki — inhi details se phir koshish karein'):t('Review','जाँचें','Check karein')}</legend>
      <label><input type="checkbox" checked={row.selected} onChange={e=>edit(index,{selected:e.target.checked})}/> {t('Include','शामिल करें','Shaamil karein')}</label>
      <label>{t('Name','नाम','Naam')}<input className="input" value={row.name} maxLength={160} onChange={e=>edit(index,{name:e.target.value})}/></label>
      <div className="grid-2"><label>{t('Price per unit ₹','प्रति इकाई कीमत ₹','Har unit ka price ₹')}<input className="input" type="number" min="0" step="0.01" value={row.selling_price??''} onChange={e=>edit(index,{selling_price:e.target.value===''?null:Number(e.target.value)})}/></label>
      <label>{t('Stock','स्टॉक','Stock')}<input className="input" type="number" min="0" step="0.001" value={row.stock} onChange={e=>edit(index,{stock:Number(e.target.value)})}/></label>
      <label>{t('Unit','इकाई','Unit')}<input className="input" maxLength={30} value={row.unit} onChange={e=>edit(index,{unit:e.target.value})}/></label>
      <label>GST %<input className="input" type="number" min="0" max="100" step="0.01" value={row.tax_rate} onChange={e=>edit(index,{tax_rate:Number(e.target.value)})}/></label></div>
      <label><input type="checkbox" checked={row.tax_inclusive} onChange={e=>edit(index,{tax_inclusive:e.target.checked})}/> {t('Price includes GST','कीमत में GST शामिल है','Price mein GST shaamil hai')}</label>
    </fieldset>)}
    {error&&<p role="alert" className="form-error">{error}</p>}{status&&<p role="status">{status}</p>}
    <button type="button" className="btn btn-primary" disabled={busy||!batch||!batch.rows.some(r=>r.selected&&r.state!=='saved')} onClick={()=>void save()}>{busy?t('Saving…','सेव हो रहा है…','Save ho raha hai…'):t('Save selected products','चुने हुए उत्पाद सेव करें','Chune hue products save karein')}</button>
    <button type="button" className="btn" disabled={busy} onClick={close}>{t('Close / discard unsaved rows','बंद करें / बाकी पंक्तियाँ छोड़ें','Band karein / baaki lines chhodein')}</button>
  </section>;
}
