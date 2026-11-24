'use client';
import { useEffect, useRef, useState } from 'react';
import { authenticatedApiRequest, getFirebaseAuth } from '@/lib/firebase';
import { getCurrentOrganization } from '@/lib/pos';
import { photoBatchKey } from '@/lib/product-photo-batch';
import ProductBatchReview from './ProductBatchReview';
import ProductPhotoInput from './ProductPhotoInput';
import { usePosLanguage, uiText } from '@/lib/pos-language';

type Speech = { lang: string; onresult: ((e: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; abort(): void };
export default function PosAssist({ mode, onDraft, onConfirm, confirmLabel, reviewContext, getBillReview, onBatchSaved }: { mode: 'product' | 'bill'; onBatchSaved?: () => void | Promise<void>; onDraft: (value: Record<string, unknown>) => void; onConfirm?: (value: Record<string, unknown>) => Promise<void>; confirmLabel?: string; reviewContext?: string; getBillReview?: (value:Record<string,unknown>,hindi:boolean)=>{text:string;signature:string;total:number} }) {
  const uiLanguage = usePosLanguage();
  const t = (en: string, hi: string, hinglish: string) => uiText(uiLanguage, en, hi, hinglish);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [speechLanguage,setSpeechLanguage] = useState('hi-IN');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  const batchOpen = mode === 'product' && Array.isArray(preview?.products);
  const speech = useRef<Speech | null>(null);
  const hindi = speechLanguage === 'hi-IN';
  const reviewFn=useRef(getBillReview);reviewFn.current=getBillReview;
  const reviewed=useRef('');
  let billReview:{text:string;signature:string;total:number}|undefined;let reviewError='';
  if(preview&&mode==='bill'&&getBillReview){try{billReview=getBillReview(preview,uiLanguage==='hi');}catch(e){reviewError=e instanceof Error?e.message:t('Please check the bill.','कृपया बिल जाँचें।','Bill check karein.');}}
  const [audioHelp, setAudioHelp] = useState(true);
  const [online, setOnline] = useState(true);
  function say(message: string) {
    if (!audioHelp || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = speechLanguage; utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
  function readPreview(value: Record<string, unknown>) {
    if(mode==='product'&&Array.isArray(value.products)){say(`${value.products.length} ${hindi?'उत्पाद मिले। हर लाइन की कीमत जाँचकर सेव करें।':'products found. Review each price, then save selected products.'}`);return;}
    if(mode==='bill'&&reviewFn.current){const review=reviewFn.current(value,hindi);reviewed.current=review.signature;say(`${review.text} ${hindi?'सही है तो बिल सेव करें दबाएं।':'If correct, press Save bill.'}`);return;}
    const summary = mode === 'product'
      ? `${value.name}. ${hindi ? 'प्रति यूनिट कीमत' : 'Price per unit'} ${value.selling_price ?? (hindi ? 'नहीं मिली' : 'missing')}. ${hindi ? 'स्टॉक' : 'Stock'} ${value.stock ?? 0}. ${hindi ? 'टैक्स प्रतिशत' : 'Tax percent'} ${value.tax_rate ?? 0}.`
      : (value.items as {product:{name:string};quantity:number}[]).map(item=>`${item.product.name}, ${item.quantity}`).join('. ');
    say(`${summary} ${hindi ? 'सही है तो सेव करें दबाएं। गलत है तो सुधारें।' : 'Check the details, then confirm to save.'}`);
  }
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online',update); window.addEventListener('offline',update);
    return () => { speech.current?.abort(); window.speechSynthesis?.cancel(); window.removeEventListener('online',update); window.removeEventListener('offline',update); };
  }, []);
  useEffect(() => {
    if (mode !== 'product') return;
    let active = true;
    void (async () => {
      try {
        const organization = await getCurrentOrganization();
        const uid = getFirebaseAuth().currentUser?.uid;
        if (active && !pending.current && !inFlight.current && organization && uid && localStorage.getItem(photoBatchKey(uid, organization.organizationId))) {
          const restored = { products: [], unresolved: [] };
          pending.current = restored; setPreview(restored);
        }
      } catch { /* A new import still checks storage before sending any product. */ }
    })();
    return () => { active = false; };
  }, [mode]);
  function listen() {
    window.speechSynthesis?.cancel();
    pending.current=null;setPreview(null);reviewed.current='';
    const browser = window as unknown as { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech };
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { setError(t('Voice is unavailable in this browser. Type instructions or choose a photo.','इस ब्राउज़र में आवाज़ की सुविधा नहीं है। लिखें या फोटो चुनें।','Is browser mein voice available nahi hai. Likhein ya photo chunein.')); return; }
    const next = new Constructor(); next.lang = speechLanguage;
    next.onresult = e => { const transcript = e.results[0]?.[0]?.transcript ?? ''; setText(transcript); if (transcript.trim()) void draft(transcript); };
    next.onerror = () => { setError(t('Check microphone permission or type your instructions.','माइक्रोफ़ोन की अनुमति जाँचें या लिखकर बताएँ।','Microphone permission check karein ya likhkar batayein.')); setListening(false); };
    next.onend = () => setListening(false);
    speech.current = next;
    try { next.start(); setListening(true); setError(''); } catch { setError(t('Could not start microphone.','माइक्रोफ़ोन शुरू नहीं हुआ।','Microphone shuru nahi hua.')); }
  }
  async function draft(instructions = text) {
    if (inFlight.current) return;
    inFlight.current = true;
    pending.current = null; setPreview(null);
    setBusy(true); setError(''); setSaved('');
    try {
      const result = await authenticatedApiRequest<{ data: Record<string, unknown> }>('/pos/assist/draft', { method: 'POST', body: JSON.stringify({ mode, text: instructions, image, batch: mode === 'product' && !!image }) });
      if(mode==='product'&&image&&!Array.isArray(result.data.products))throw new Error(t('The server returned a single product instead of the full list. Wait for the API update, then try again. No products were saved.','पूरी सूची की जगह केवल एक उत्पाद मिला। सर्वर अपडेट के बाद फिर कोशिश करें। कोई उत्पाद सेव नहीं हुआ।','Poori list ki jagah sirf ek product mila. Server update ke baad phir koshish karein. Koi product save nahi hua.'));
      pending.current = result.data; setPreview(result.data);
      readPreview(result.data);
    } catch (e) { setError(e instanceof Error ? e.message : t('Could not prepare draft.','ड्राफ्ट तैयार नहीं हुआ।','Draft taiyar nahi hua.')); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!pending.current || !onConfirm || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if(mode==='bill'&&reviewFn.current){const review=reviewFn.current(pending.current,hindi);if(review.signature!==reviewed.current){readPreview(pending.current);setError(t('Bill changed. Review the updated total, then press Save again.','बिल बदला है। नई रकम जाँचकर फिर सेव करें दबाएँ।','Bill badla hai. Nayi rakam check karke phir Save dabayein.'));return;}}
      await onConfirm(pending.current);
      pending.current = null; setPreview(null); setText(''); setImage(undefined);
      setSaved(mode === 'product' ? t('Product saved.','उत्पाद सेव हो गया।','Product save ho gaya.') : t('Bill saved.','बिल सेव हो गया।','Bill save ho gaya.'));
      say(hindi ? (mode === 'product' ? 'माल सेव हो गया।' : 'बिल सेव हो गया।') : 'Saved successfully.');
    } catch (e) { setError(e instanceof Error ? e.message : t('Could not save.','सेव नहीं हुआ।','Save nahi hua.')); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function editPreview(key: string, value: unknown) {
    const next = { ...pending.current, [key]: value }; pending.current = next; setPreview(next);
  }
  function applyDraft() {
    const value = pending.current;
    if (!value) return;
    pending.current = null;
    try {
      onDraft(value);
      setPreview(null); setText(''); setImage(undefined); setError('');
    } catch (e) {
      pending.current = value;
      setError(e instanceof Error ? e.message : t('Could not apply draft.','ड्राफ्ट लागू नहीं हुआ।','Draft apply nahi hua.'));
    }
  }
  return <section className="card inline-form-panel voice-counter" aria-label={t('AI assistant','AI सहायक','AI madad')}>
    <h2>{mode === 'product' ? t('📦 Add stock','📦 माल जोड़ें','📦 Maal jodein') : t('🧾 Make a bill','🧾 बिल बनाएँ','🧾 Bill banayein')}</h2>
    <p>{t('Speak → Check → Save','बोलिए → जाँचिए → सेव कीजिए','Boliye → Check karein → Save karein')}</p>
    {!online && <p role="alert">{t('Internet is disconnected. AI and saving through this assistant need a connection.','इंटरनेट बंद है। AI और इस सहायक से सेव करने के लिए इंटरनेट चाहिए।','Internet band hai. AI aur is assistant se save karne ke liye internet chahiye.')}</p>}
    <button type="button" className="voice-counter-mic" disabled={busy || !online || batchOpen} onClick={()=>listening ? speech.current?.abort() : listen()}>{listening ? t('⏹ Listening… Stop','⏹ सुन रहे हैं… रोकें','⏹ Sun rahe hain… Rokein') : t('🎙 Tap and speak','🎙 यहाँ दबाकर बोलें','🎙 Yahan dabakar bolein')}</button>
    <p>{mode==='product' ? t('For example: Add twenty biscuit packets, ten rupees per packet.','जैसे: बीस पैकेट बिस्कुट जोड़ो, एक पैकेट दस रुपये।','Jaise: bees packet biscuit jodo, ek packet das rupaye.') : t('For example: Make a bill for two kilos of flour and one bottle of oil.','जैसे: दो किलो आटा और एक बोतल तेल का बिल बनाओ।','Jaise: do kilo aata aur ek bottle tel ka bill banao.')}</p>
    <details><summary>{t('⌨ Type / Photo / Voice language','⌨ लिखें / फोटो / बोलने की भाषा','⌨ Likhein / Photo / Bolne ki bhasha')}</summary>
    <label>{t('Voice language','बोलने की भाषा','Bolne ki bhasha')} <select className="select" value={speechLanguage} disabled={listening||busy||batchOpen} onChange={e=>setSpeechLanguage(e.target.value)}><option value="hi-IN">{t('Hindi / Hinglish','हिंदी / हिंग्लिश','Hindi / Hinglish')}</option><option value="en-IN">{t('English (India)','अंग्रेज़ी (भारत)','English (India)')}</option></select></label>
    <p>{mode === 'product' ? t('Describe a product, or photograph a list of up to 30 products with prices. Review every detected row before saving.','एक उत्पाद बताएँ या कीमतों सहित अधिकतम 30 उत्पादों की सूची की फोटो लें। सेव करने से पहले हर पंक्ति जाँचें।','Ek product batayein ya prices ke saath 30 tak products ki list ki photo lein. Save karne se pehle har line check karein.') : t('Say the quantities and product names; close name matches are supported. Similar products will be shown for clarification. Catalog prices are used; review before saving.','मात्रा और सामान के नाम बोलें; मिलते-जुलते नाम भी पहचाने जाएँगे। समान उत्पाद होने पर विकल्प पूछे जाएँगे। कैटलॉग की कीमतें लगेंगी; सेव करने से पहले जाँचें।','Quantity aur samaan ke naam bolein; milte-julte naam bhi pehchane jayenge. Similar products hon to options pooche jayenge. Catalog ke prices lagenge; save karne se pehle check karein.')}</p>
    <div className="field"><label htmlFor={`assist-${mode}`}>{t('Instructions','क्या करना है?','Kya karna hai?')}</label><textarea id={`assist-${mode}`} className="input" maxLength={2000} value={text} disabled={busy || listening || batchOpen} onChange={e => { setText(e.target.value); pending.current = null; setPreview(null); }} /></div>
    <ProductPhotoInput disabled={busy || listening || batchOpen} onError={setError} onPhoto={data => { setImage(data); setError(''); pending.current = null; setPreview(null); }} />
    {image && <p role="status">{t('Photo selected. Press Preview below.','फोटो चुनी गई है। नीचे देखें दबाएँ।','Photo chun li hai. Neeche Preview dabayein.')} <button type="button" className="btn" disabled={busy || batchOpen} onClick={() => setImage(undefined)}>{t('Remove photo','फोटो हटाएँ','Photo hatayein')}</button></p>}
    <p className="muted">{t('Photos and complex requests are sent to the configured AI provider. Voice may use your browser’s speech service.','फोटो और जटिल अनुरोध आपके चुने हुए AI प्रदाता को भेजे जाते हैं। आवाज़ के लिए ब्राउज़र की सेवा इस्तेमाल हो सकती है।','Photos aur complex requests chune hue AI provider ko bheji jaati hain. Voice ke liye browser ki speech service istemal ho sakti hai.')}</p>
    <label><input type="checkbox" checked={audioHelp} onChange={e=>{setAudioHelp(e.target.checked);if(!e.target.checked)window.speechSynthesis?.cancel();}} />{t('Spoken guidance','बोलकर मदद करें','Bolkar madad karein')}</label>
    <button type="button" className="btn" disabled={busy || listening || !online || batchOpen || (!text.trim()&&!image)} onClick={()=>draft()}>{t('Preview','देखें','Preview dekhein')}</button>
    </details>
    {error && <div className="form-error" role="alert">{error}</div>}
    {saved && <p role="status">{saved}</p>}
    {batchOpen && preview && <ProductBatchReview products={preview.products as Record<string,unknown>[]} unresolved={Array.isArray(preview.unresolved) ? preview.unresolved as string[] : []} onSaved={onBatchSaved} onClose={() => { pending.current = null; setPreview(null); setImage(undefined); setText(''); }} />}
    {preview && !batchOpen && <div aria-label={t('Review draft','ड्राफ्ट जाँचें','Draft check karein')} aria-live="polite">
      <h3>{t('Is this correct?','क्या यह सही है?','Kya yeh sahi hai?')}</h3>
      <button type="button" className="btn" disabled={!!reviewError||busy||listening} onClick={()=>{try{readPreview(preview);}catch(e){setError(e instanceof Error?e.message:t('Please check details.','कृपया जानकारी जाँचें।','Jaankari check karein.'));}}}>{t('🔊 Listen again','🔊 फिर सुनें','🔊 Phir sunein')}</button>
      {mode === 'product' ? <p>{String(preview.name)} · {preview.selling_price == null ? t('Price missing — enter manually','कीमत नहीं मिली — खुद भरें','Price nahi mila — khud bharein') : `₹${Number(preview.selling_price).toFixed(2)}`}</p>
        : <ul>{(preview.items as { product: { id: string; name: string; selling_price: number }; quantity: number }[]).map(item => <li key={item.product.id}>{item.product.name} × {item.quantity} · ₹{Number(item.product.selling_price).toFixed(2)} {t('each','प्रति इकाई','prati unit')}</li>)}</ul>}
      {mode === 'product' && onConfirm && <fieldset disabled={busy} style={{border:0,padding:0}}>
        <label>{t('Name','नाम','Naam')}<input className="input" value={String(preview.name ?? '')} onChange={e=>editPreview('name',e.target.value)} /></label>
        <label>{t('Price per unit (₹)','प्रति इकाई कीमत (₹)','Har unit ka price (₹)')}<input className="input" type="number" min="0" step="0.01" value={preview.selling_price == null ? '' : Number(preview.selling_price)} onChange={e=>editPreview('selling_price',e.target.value === '' ? null : Number(e.target.value))} /></label>
        <label>{t('Opening stock','शुरुआती स्टॉक','Shuru ka stock')}<input className="input" type="number" min="0" step="0.001" value={Number(preview.stock ?? 0)} onChange={e=>editPreview('stock',Number(e.target.value))} /></label>
        <label>{t('Unit','इकाई','Unit')}<input className="input" value={String(preview.unit ?? 'pcs')} onChange={e=>editPreview('unit',e.target.value)} /></label>
        <label>{t('GST %','GST %','GST %')}<input className="input" type="number" min="0" max="100" value={Number(preview.tax_rate ?? 0)} onChange={e=>editPreview('tax_rate',Number(e.target.value))} /></label>
        <label><input type="checkbox" checked={Boolean(preview.tax_inclusive)} onChange={e=>editPreview('tax_inclusive',e.target.checked)} />{t('Price includes GST','कीमत में GST शामिल है','Price mein GST shaamil hai')}</label>
      </fieldset>}
      {billReview&&<div className="card"><strong>{t('Total','कुल','Kul')} ₹{billReview.total.toFixed(2)}</strong><p>{billReview.text}</p></div>}{reviewError&&<p role="alert" className="form-error">{reviewError}</p>}
      <p>{reviewContext || t('Check the price per unit, stock and tax before saving.','सेव करने से पहले प्रति इकाई कीमत, स्टॉक और टैक्स जाँचें।','Save karne se pehle har unit ka price, stock aur tax check karein.')}</p>
      {onConfirm && <button type="button" className="btn btn-primary voice-counter-save" disabled={busy || listening || !online || !!reviewError || (mode==='product' && (preview.selling_price == null || !String(preview.name??'').trim()))} onClick={confirm}>{busy ? t('Saving…','सेव हो रहा है…','Save ho raha hai…') : confirmLabel ?? (mode==='product' ? t('✓ Confirm & save product','✓ सही है, माल सेव करें','✓ Sahi hai, maal save karein') : t('✓ Confirm & save bill','✓ सही है, बिल सेव करें','✓ Sahi hai, bill save karein'))}</button>}
      <button type="button" className="btn" disabled={busy || listening} onClick={applyDraft}>{t('✎ Edit details','✎ सुधारें','✎ Sudharein')}</button>
      <button type="button" className="btn" disabled={busy} onClick={() => { pending.current = null; setPreview(null); }}>{t('Discard draft','रद्द करें','Radd karein')}</button>
    </div>}
    {busy && <p role="status">{t('Please wait…','थोड़ा रुकिए…','Thoda rukiye…')}</p>}
  </section>;
}
