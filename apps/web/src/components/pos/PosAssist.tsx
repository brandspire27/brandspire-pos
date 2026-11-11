'use client';
import { useEffect, useRef, useState } from 'react';
import { authenticatedApiRequest } from '@/lib/firebase';

type Speech = { lang: string; onresult: ((e: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; abort(): void };
export default function PosAssist({ mode, onDraft, onConfirm, confirmLabel, reviewContext }: { mode: 'product' | 'bill'; onDraft: (value: Record<string, unknown>) => void; onConfirm?: (value: Record<string, unknown>) => Promise<void>; confirmLabel?: string; reviewContext?: string }) {
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
  const photoInput = useRef<HTMLInputElement | null>(null);
  const speech = useRef<Speech | null>(null);
  const hindi = language === 'hi-IN';
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
    const summary = mode === 'product'
      ? `${value.name}. ${hindi ? 'प्रति यूनिट कीमत' : 'Price per unit'} ${value.selling_price ?? (hindi ? 'नहीं मिली' : 'missing')}. ${hindi ? 'स्टॉक' : 'Stock'} ${value.stock ?? 0}. ${hindi ? 'टैक्स प्रतिशत' : 'Tax percent'} ${value.tax_rate ?? 0}.`
      : (value.items as {product:{name:string};quantity:number}[]).map(item=>`${item.product.name}, ${item.quantity}`).join('. ');
    say(`${summary} ${hindi ? 'सही है तो हरे बटन से सेव करें। गलत है तो सुधारें।' : 'Check the details, then confirm to save.'}`);
  }
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online',update); window.addEventListener('offline',update);
    return () => { speech.current?.abort(); window.speechSynthesis?.cancel(); window.removeEventListener('online',update); window.removeEventListener('offline',update); };
  }, []);
  function listen() {
    window.speechSynthesis?.cancel();
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
      const result = await authenticatedApiRequest<{ data: Record<string, unknown> }>('/pos/assist/draft', { method: 'POST', body: JSON.stringify({ mode, text: instructions, image }) });
      pending.current = result.data; setPreview(result.data);
      readPreview(result.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare draft.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!pending.current || !onConfirm || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await onConfirm(pending.current);
      pending.current = null; setPreview(null); setText(''); setImage(undefined);
      if (photoInput.current) photoInput.current.value = '';
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
      if (photoInput.current) photoInput.current.value = '';
    } catch (e) {
      pending.current = value;
      setError(e instanceof Error ? e.message : 'Could not apply draft.');
    }
  }
  return <section className="card inline-form-panel voice-counter" aria-label="AI assistant">
    <h2>{hindi ? (mode === 'product' ? '📦 माल जोड़ें' : '🧾 बिल बनाएं') : (mode === 'product' ? 'Add stock' : 'Make a bill')}</h2>
    <p>{hindi ? 'बोलिए → सुनकर जाँचिए → सेव कीजिए' : 'Speak → Check → Save'}</p>
    {!online && <p role="alert">{hindi ? 'इंटरनेट बंद है। अभी यह AI सुविधा और वेब बिल सेव करने के लिए इंटरनेट चाहिए।' : 'Internet is disconnected. AI and web bill saving currently require a connection.'}</p>}
    <button type="button" className="voice-counter-mic" disabled={busy || !online} onClick={()=>listening ? speech.current?.abort() : listen()}>{listening ? (hindi ? '⏹ सुन रहे हैं… रोकें' : 'Listening… Stop') : (hindi ? '🎙 यहाँ दबाकर बोलें' : 'Tap and speak')}</button>
    <p>{hindi ? (mode==='product' ? 'जैसे: बीस पैकेट बिस्कुट जोड़ो, एक पैकेट दस रुपये।' : 'जैसे: दो किलो आटा और एक बोतल तेल का बिल बनाओ।') : 'Say the item names and quantities clearly.'}</p>
    <details><summary>{hindi ? '⌨ लिखें / फोटो / भाषा' : 'Type / Photo / Language'}</summary>
    <label>Voice language <select className="select" value={language} disabled={listening||busy} onChange={e=>setLanguage(e.target.value)}><option value="hi-IN">Hindi / Hinglish</option><option value="en-IN">English (India)</option></select></label>
    <p>{mode === 'product' ? 'Describe one product with its price, or choose a photo showing the label and price.' : 'Describe items and quantities or choose a shopping list photo. Uses catalog prices.'} Review before saving.</p>
    <div className="field"><label htmlFor={`assist-${mode}`}>Instructions</label><textarea id={`assist-${mode}`} className="input" maxLength={2000} value={text} disabled={busy || listening} onChange={e => { setText(e.target.value); pending.current = null; setPreview(null); }} /></div>
    <div className="field"><label>Photo (JPEG, PNG, WebP; up to 2 MB)<input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => {
      const file = e.target.files?.[0]; setImage(undefined); setError(''); pending.current = null; setPreview(null);
      if (!file) return;
      if (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG or WebP up to 2 MB.'); e.target.value = ''; return; }
      const reader = new FileReader(); reader.onload = () => setImage(String(reader.result)); reader.onerror = () => setError('Could not read photo.'); reader.readAsDataURL(file);
    }} /></label></div>
    <p className="muted">Simple text drafts use your backend without a cloud AI call. Other requests go to your configured AI provider. Voice may use your browser’s speech service.</p>
    <label><input type="checkbox" checked={audioHelp} onChange={e=>{setAudioHelp(e.target.checked);if(!e.target.checked)window.speechSynthesis?.cancel();}} />{hindi ? 'बोलकर मदद करें' : 'Spoken guidance'}</label>
    <button type="button" className="btn" disabled={busy || listening || !online || (!text.trim()&&!image)} onClick={()=>draft()}>{hindi ? 'देखें' : 'Preview'}</button>
    </details>
    {error && <div className="form-error" role="alert">{error}</div>}
    {saved && <p role="status">{saved}</p>}
    {preview && <div aria-label="Review draft" aria-live="polite">
      <h3>{hindi ? 'क्या यह सही है?' : 'Is this correct?'}</h3>
      <button type="button" className="btn" onClick={()=>readPreview(preview)}>{hindi ? '🔊 फिर सुनें' : 'Listen again'}</button>
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
      <p>{reviewContext || 'Check the price per unit, stock and tax before saving.'}</p>
      {onConfirm && <button type="button" className="btn btn-primary voice-counter-save" disabled={busy || listening || !online || (mode==='product' && (preview.selling_price == null || !String(preview.name??'').trim()))} onClick={confirm}>{busy ? (hindi ? 'सेव हो रहा है…' : 'Saving…') : hindi ? (mode==='product' ? '✓ सही है, माल सेव करें' : '✓ सही है, बिल सेव करें') : confirmLabel ?? 'Confirm & save product'}</button>}
      <button type="button" className="btn" disabled={busy || listening} onClick={applyDraft}>{hindi ? '✎ सुधारें' : 'Edit details'}</button>
      <button type="button" className="btn" disabled={busy} onClick={() => { pending.current = null; setPreview(null); }}>Discard draft</button>
    </div>}
    {busy && <p role="status">{hindi ? 'थोड़ा रुकिए…' : 'Please wait…'}</p>}
  </section>;
}
