'use client';
import { useEffect, useRef, useState } from 'react';
import { authenticatedApiRequest } from '@/lib/firebase';

type Speech = { lang: string; onresult: ((e: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; abort(): void };
export default function PosAssist({ mode, onDraft }: { mode: 'product' | 'bill'; onDraft: (value: Record<string, unknown>) => void }) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [language,setLanguage] = useState('hi-IN');
  const speech = useRef<Speech | null>(null);
  useEffect(() => () => speech.current?.abort(), []);
  function listen() {
    const browser = window as unknown as { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech };
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { setError('Voice is unavailable in this browser. Type instructions or choose a photo.'); return; }
    const next = new Constructor(); next.lang = language;
    next.onresult = e => setText(e.results[0]?.[0]?.transcript ?? '');
    next.onerror = () => { setError('Check microphone permission or type your instructions.'); setListening(false); };
    next.onend = () => setListening(false);
    speech.current = next;
    try { next.start(); setListening(true); setError(''); } catch { setError('Could not start microphone.'); }
  }
  async function draft() {
    setBusy(true); setError('');
    try {
      const result = await authenticatedApiRequest<{ data: Record<string, unknown> }>('/pos/assist/draft', { method: 'POST', body: JSON.stringify({ mode, text, image }) });
      onDraft(result.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare draft.'); }
    finally { setBusy(false); }
  }
  return <section className="card inline-form-panel" aria-label="AI assistant">
    <h2>{mode === 'product' ? 'Product from voice or photo' : 'AI bill draft'}</h2>
    <label>Voice language <select className="select" value={language} disabled={listening||busy} onChange={e=>setLanguage(e.target.value)}><option value="hi-IN">Hindi / Hinglish</option><option value="en-IN">English (India)</option></select></label>
    <p>{mode === 'product' ? 'Describe one product with its price, or choose a photo showing the label and price.' : 'Describe items and quantities or choose a shopping list photo. Uses catalog prices.'} Review before saving.</p>
    <div className="field"><label htmlFor={`assist-${mode}`}>Instructions</label><textarea id={`assist-${mode}`} className="input" maxLength={2000} value={text} onChange={e => setText(e.target.value)} /></div>
    <div className="field"><label>Photo (JPEG, PNG, WebP; up to 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => {
      const file = e.target.files?.[0]; setImage(undefined); setError('');
      if (!file) return;
      if (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG or WebP up to 2 MB.'); e.target.value = ''; return; }
      const reader = new FileReader(); reader.onload = () => setImage(String(reader.result)); reader.onerror = () => setError('Could not read photo.'); reader.readAsDataURL(file);
    }} /></label></div>
    <p className="muted">Preparing a draft sends text and photos to your configured AI provider. Voice may use your browser’s speech service.</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={() => listening ? speech.current?.abort() : listen()}>{listening ? 'Stop microphone' : 'Use voice'}</button><button type="button" className="btn btn-primary" disabled={busy || listening || (!text.trim() && !image)} onClick={draft}>{busy ? 'Preparing…' : 'Prepare draft'}</button></div>
  </section>;
}
