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
  useEffect(() => () => speech.current?.abort(), []);
  function listen() {
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
  return <section className="card inline-form-panel" aria-label="AI assistant">
    <h2>{mode === 'product' ? 'Add a product with AI' : 'Make a bill with AI'}</h2>
    <p>Speak naturally, review, then confirm. Voice prepares your preview automatically.</p>
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
    {error && <div className="form-error" role="alert">{error}</div>}
    {saved && <p role="status">{saved}</p>}
    {preview && <div aria-label="Review draft" aria-live="polite">
      <h3>Review draft</h3>
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
      {onConfirm && <button type="button" className="btn btn-primary" disabled={busy || listening || (mode==='product' && (preview.selling_price == null || !String(preview.name??'').trim()))} onClick={confirm}>{busy ? 'Saving…' : confirmLabel ?? 'Confirm & save product'}</button>}
      <button type="button" className="btn" disabled={busy || listening} onClick={applyDraft}>{mode === 'product' ? 'More details' : 'Edit in cart'}</button>
      <button type="button" className="btn" disabled={busy} onClick={() => { pending.current = null; setPreview(null); }}>Discard draft</button>
    </div>}
    <div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={() => listening ? speech.current?.abort() : listen()}>{listening ? 'Stop microphone' : 'Use voice'}</button><button type="button" className="btn btn-primary" disabled={busy || listening || (!text.trim() && !image)} onClick={()=>draft()}>{busy ? 'Working…' : 'Preview'}</button></div>
  </section>;
}
