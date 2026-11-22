'use client';
import { useEffect, useRef, useState } from 'react';
import { authenticatedApiRequest, getFirebaseAuth } from '@/lib/firebase';
import { getCurrentOrganization } from '@/lib/pos';
import { photoBatchKey } from '@/lib/product-photo-batch';
import ProductBatchReview from './ProductBatchReview';
import ProductPhotoInput from './ProductPhotoInput';

type Speech = { lang: string; onresult: ((e: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; abort(): void };
export default function PosAssist({ mode, onDraft, onConfirm, confirmLabel, reviewContext, getBillReview, onBatchSaved }: { mode: 'product' | 'bill'; onBatchSaved?: () => void | Promise<void>; onDraft: (value: Record<string, unknown>) => void; onConfirm?: (value: Record<string, unknown>) => Promise<void>; confirmLabel?: string; reviewContext?: string; getBillReview?: (value:Record<string,unknown>,hindi:boolean)=>{text:string;signature:string;total:number} }) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [language,setLanguage] = useState('hi-IN');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  const batchOpen = mode === 'product' && Array.isArray(preview?.products);
  const speech = useRef<Speech | null>(null);
  const hindi = language === 'hi-IN';
  const reviewFn=useRef(getBillReview);reviewFn.current=getBillReview;
  const reviewed=useRef('');
  let billReview:{text:string;signature:string;total:number}|undefined;let reviewError='';
  if(preview&&mode==='bill'&&getBillReview){try{billReview=getBillReview(preview,hindi);}catch(e){reviewError=e instanceof Error?e.message:'Please check the bill.';}}
  const [audioHelp, setAudioHelp] = useState(true);
  const [online, setOnline] = useState(true);
  function say(message: string) {
    if (!audioHelp || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = language; utterance.rate = 0.9;
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
    if (!Constructor) { setError('Voice is unavailable in this browser. Type instructions or choose a photo.'); return; }
    const next = new Constructor(); next.lang = language;
    next.onresult = e => { const transcript = e.results[0]?.[0]?.transcript ?? ''; setText(transcript); if (transcript.trim()) void draft(transcript); };
    next.onerror = () => { setError('Check microphone permission or type your instructions.'); setListening(false); };
    next.onend = () => setListening(false);
    speech.current = next;
    try { next.start(); setListening(true); setError(''); } catch { setError('Could not start microphone.'); }
  }
  async function draft(instructions = text) {
    if (inFlight.current) return;
    inFlight.current = true;
    pending.current = null; setPreview(null);
    setBusy(true); setError(''); setSaved('');
    try {
      const result = await authenticatedApiRequest<{ data: Record<string, unknown> }>('/pos/assist/draft', { method: 'POST', body: JSON.stringify({ mode, text: instructions, image, batch: mode === 'product' && !!image }) });
      if(mode==='product'&&image&&!Array.isArray(result.data.products))throw new Error('The server returned a single product instead of the full list. Wait for the API update, then try again. No products were saved.');
      pending.current = result.data; setPreview(result.data);
      readPreview(result.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare draft.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!pending.current || !onConfirm || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if(mode==='bill'&&reviewFn.current){const review=reviewFn.current(pending.current,hindi);if(review.signature!==reviewed.current){readPreview(pending.current);setError(hindi?'बिल बदला है। नई रकम सुनकर फिर सेव करें दबाएं।':'Bill changed. Review the updated total, then press Save again.');return;}}
      await onConfirm(pending.current);
      pending.current = null; setPreview(null); setText(''); setImage(undefined);
      setSaved(mode === 'product' ? 'Product saved.' : 'Bill saved.');
      say(hindi ? (mode === 'product' ? 'माल सेव हो गया।' : 'बिल सेव हो गया।') : 'Saved successfully.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
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
      setError(e instanceof Error ? e.message : 'Could not apply draft.');
    }
  }
  return <section className="card inline-form-panel voice-counter" aria-label="AI assistant">
    <h2>{hindi ? (mode === 'product' ? '📦 माल जोड़ें' : '🧾 बिल बनाएं') : (mode === 'product' ? 'Add stock' : 'Make a bill')}</h2>
    <p>{hindi ? 'बोलिए → सुनकर जाँचिए → सेव कीजिए' : 'Speak → Check → Save'}</p>
    {!online && <p role="alert">{hindi ? 'इंटरनेट बंद है। अभी यह AI सुविधा और वेब बिल सेव करने के लिए इंटरनेट चाहिए।' : 'Internet is disconnected. AI and web bill saving currently require a connection.'}</p>}
    <button type="button" className="voice-counter-mic" disabled={busy || !online || batchOpen} onClick={()=>listening ? speech.current?.abort() : listen()}>{listening ? (hindi ? '⏹ सुन रहे हैं… रोकें' : 'Listening… Stop') : (hindi ? '🎙 यहाँ दबाकर बोलें' : 'Tap and speak')}</button>
    <p>{hindi ? (mode==='product' ? 'जैसे: बीस पैकेट बिस्कुट जोड़ो, एक पैकेट दस रुपये।' : 'जैसे: दो किलो आटा और एक बोतल तेल का बिल बनाओ।') : 'Say the item names and quantities clearly.'}</p>
    <details><summary>{hindi ? '⌨ लिखें / फोटो / भाषा' : 'Type / Photo / Language'}</summary>
    <label>Voice language <select className="select" value={language} disabled={listening||busy||batchOpen} onChange={e=>setLanguage(e.target.value)}><option value="hi-IN">Hindi / Hinglish</option><option value="en-IN">English (India)</option></select></label>
    <p>{mode === 'product' ? 'Describe a product, or photograph a list of up to 30 products with prices. Every detected row can be reviewed and saved together.' : 'Describe items and quantities or choose a shopping list photo. Uses catalog prices.'} Review before saving.</p>
    <div className="field"><label htmlFor={`assist-${mode}`}>Instructions</label><textarea id={`assist-${mode}`} className="input" maxLength={2000} value={text} disabled={busy || listening || batchOpen} onChange={e => { setText(e.target.value); pending.current = null; setPreview(null); }} /></div>
    <ProductPhotoInput disabled={busy || listening || batchOpen} hindi={hindi} onError={setError} onPhoto={data => { setImage(data); setError(''); pending.current = null; setPreview(null); }} />
    {image && <p role="status">{hindi ? 'फोटो चुनी गई है। नीचे देखें दबाएं।' : 'Photo selected. Press Preview below.'} <button type="button" className="btn" disabled={busy || batchOpen} onClick={() => setImage(undefined)}>{hindi ? 'फोटो हटाएं' : 'Remove photo'}</button></p>}
    <p className="muted">Simple text drafts use your backend without a cloud AI call. Other requests go to your configured AI provider. Voice may use your browser’s speech service.</p>
    <label><input type="checkbox" checked={audioHelp} onChange={e=>{setAudioHelp(e.target.checked);if(!e.target.checked)window.speechSynthesis?.cancel();}} />{hindi ? 'बोलकर मदद करें' : 'Spoken guidance'}</label>
    <button type="button" className="btn" disabled={busy || listening || !online || batchOpen || (!text.trim()&&!image)} onClick={()=>draft()}>{hindi ? 'देखें' : 'Preview'}</button>
    </details>
    {error && <div className="form-error" role="alert">{error}</div>}
    {saved && <p role="status">{saved}</p>}
    {batchOpen && preview && <ProductBatchReview products={preview.products as Record<string,unknown>[]} unresolved={Array.isArray(preview.unresolved) ? preview.unresolved as string[] : []} hindi={hindi} onSaved={onBatchSaved} onClose={() => { pending.current = null; setPreview(null); setImage(undefined); setText(''); }} />}
    {preview && !batchOpen && <div aria-label="Review draft" aria-live="polite">
      <h3>{hindi ? 'क्या यह सही है?' : 'Is this correct?'}</h3>
      <button type="button" className="btn" disabled={!!reviewError||busy||listening} onClick={()=>{try{readPreview(preview);}catch(e){setError(e instanceof Error?e.message:'Please check details.');}}}>{hindi ? '🔊 फिर सुनें' : 'Listen again'}</button>
      {mode === 'product' ? <p>{String(preview.name)} · {preview.selling_price == null ? 'Price missing — enter manually' : `₹${Number(preview.selling_price).toFixed(2)}`}</p>
        : <ul>{(preview.items as { product: { id: string; name: string; selling_price: number }; quantity: number }[]).map(item => <li key={item.product.id}>{item.product.name} × {item.quantity} · ₹{Number(item.product.selling_price).toFixed(2)} each</li>)}</ul>}
      {mode === 'product' && onConfirm && <fieldset disabled={busy} style={{border:0,padding:0}}>
        <label>Name<input className="input" value={String(preview.name ?? '')} onChange={e=>editPreview('name',e.target.value)} /></label>
        <label>Price per unit (₹)<input className="input" type="number" min="0" step="0.01" value={preview.selling_price == null ? '' : Number(preview.selling_price)} onChange={e=>editPreview('selling_price',e.target.value === '' ? null : Number(e.target.value))} /></label>
        <label>Opening stock<input className="input" type="number" min="0" step="0.001" value={Number(preview.stock ?? 0)} onChange={e=>editPreview('stock',Number(e.target.value))} /></label>
        <label>Unit<input className="input" value={String(preview.unit ?? 'pcs')} onChange={e=>editPreview('unit',e.target.value)} /></label>
        <label>GST %<input className="input" type="number" min="0" max="100" value={Number(preview.tax_rate ?? 0)} onChange={e=>editPreview('tax_rate',Number(e.target.value))} /></label>
        <label><input type="checkbox" checked={Boolean(preview.tax_inclusive)} onChange={e=>editPreview('tax_inclusive',e.target.checked)} />Price includes GST</label>
      </fieldset>}
      {billReview&&<div className="card"><strong>{hindi?'कुल':'Total'} ₹{billReview.total.toFixed(2)}</strong><p>{billReview.text}</p></div>}{reviewError&&<p role="alert" className="form-error">{reviewError}</p>}
      <p>{reviewContext || 'Check the price per unit, stock and tax before saving.'}</p>
      {onConfirm && <button type="button" className="btn btn-primary voice-counter-save" disabled={busy || listening || !online || !!reviewError || (mode==='product' && (preview.selling_price == null || !String(preview.name??'').trim()))} onClick={confirm}>{busy ? (hindi ? 'सेव हो रहा है…' : 'Saving…') : hindi ? (mode==='product' ? '✓ सही है, माल सेव करें' : '✓ सही है, बिल सेव करें') : confirmLabel ?? 'Confirm & save product'}</button>}
      <button type="button" className="btn" disabled={busy || listening} onClick={applyDraft}>{hindi ? '✎ सुधारें' : 'Edit details'}</button>
      <button type="button" className="btn" disabled={busy} onClick={() => { pending.current = null; setPreview(null); }}>{hindi?'रद्द करें':'Discard draft'}</button>
    </div>}
    {busy && <p role="status">{hindi ? 'थोड़ा रुकिए…' : 'Please wait…'}</p>}
  </section>;
}
