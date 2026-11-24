'use client';

import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { uiText, usePosLanguage } from '@/lib/pos-language';

type Props = { onScan: (code: string) => void | Promise<void>; hindi?: boolean; disabled?: boolean; label?: string };

export default function CameraBarcodeScanner({ onScan, hindi = false, disabled = false, label }: Props) {
  const language=usePosLanguage();
  const tr=(en:string,hi:string,hinglish:string)=>uiText(language,en,hi,hinglish);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const video = useRef<HTMLVideoElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const accepted = useRef(false);
  const onScanRef = useRef(onScan);
  const mounted = useRef(true);
  onScanRef.current = onScan;

  function stop() {
    controls.current?.stop(); controls.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }
  function close() { stop(); setOpen(false); trigger.current?.focus(); }
  async function submit(raw: string) {
    const code = raw.trim();
    if (accepted.current || !code) return;
    if (code.length > 80 || !/^[A-Za-z0-9 ._-]+$/.test(code)) {
      setError(tr('Scan a product barcode, not a website or payment QR.','सामान का बारकोड स्कैन करें। वेबसाइट या भुगतान का QR नहीं।','Product ka barcode scan karein. Link ya payment QR nahi.'));
      return;
    }
    accepted.current = true;
    stop(); setOpen(false); setBusy(true); setError('');
    try { await onScanRef.current(code); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : tr('Could not use this barcode. Try again.','यह बारकोड इस्तेमाल नहीं हुआ। दोबारा कोशिश करें।','Yeh barcode use nahi hua. Dobara koshish karein.')); }
    finally { if (mounted.current) { setBusy(false); trigger.current?.focus(); } }
  }
  const submitRef = useRef(submit); submitRef.current = submit;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const preview = video.current;
    accepted.current = false;
    setError('');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const onVisibility = () => { if (document.hidden) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error(tr('Open the app over HTTPS for camera access, or enter the barcode below.','कैमरे के लिए ऐप HTTPS पर खोलें, या नीचे बारकोड लिखें।','Camera ke liye HTTPS par app kholein. Barcode neeche likh sakte hain.'));
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (cancelled) { media.getTracks().forEach(track => track.stop()); return; }
        stream.current = media;
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 160, delayBetweenScanSuccess: 500 });
        const scanner = await reader.decodeFromStream(media, preview ?? undefined, (result, _error, active) => {
          if (result && !cancelled && !accepted.current) {
            controls.current = active;
            void submitRef.current(result.getText());
          }
        });
        if (cancelled || accepted.current) scanner.stop();
        else controls.current = scanner;
      } catch (reason) {
        if (cancelled) return;
        stop();
        const name = reason instanceof Error ? reason.name : '';
        setError(name === 'NotAllowedError' ? (tr('Allow camera permission, or enter the barcode below.','कैमरे की अनुमति दें, या नीचे बारकोड लिखें।','Camera permission allow karein, ya barcode likhein.')) : name === 'NotFoundError' ? (tr('No camera found. Enter the barcode below.','कैमरा नहीं मिला। नीचे बारकोड लिखें।','Camera nahi mila. Barcode likh sakte hain.')) : reason instanceof Error ? reason.message : tr('Camera unavailable. Enter the barcode below.','कैमरा उपलब्ध नहीं है। नीचे बारकोड लिखें।','Camera available nahi hai. Neeche barcode likhein.'));
      }
    })();
    return () => { cancelled = true; stop(); document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility); };
  }, [open, facing, language]);

  return <>
    <button ref={trigger} type="button" className="btn" disabled={disabled || busy} onClick={() => { setManual(''); setOpen(true); }}>{busy ? (tr('Looking up…','ढूँढ रहे हैं…','Dhoondh rahe hain…')) : label || (tr('Scan barcode','बारकोड स्कैन करें','Camera se barcode scan'))}</button>
    {!open && error && <span role="alert" style={{ color: '#b42318', display: 'block' }}>{error}</span>}
    {open && <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 5000, background: '#091426b8', display: 'grid', placeItems: 'center', padding: 16 }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label={tr('Scan product barcode','सामान का बारकोड स्कैन करें','Barcode scan karein')} style={{ width: 'min(100%, 520px)', maxHeight: '95dvh', overflow: 'auto', background: 'white', color: '#172033', padding: 20, borderRadius: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h2 style={{ margin: 0 }}>{tr('Scan product barcode','सामान का बारकोड स्कैन करें','Barcode scan karein')}</h2><button autoFocus className="btn" type="button" onClick={close}>{tr('Close','बंद करें','Band karein')}</button></div>
        <p style={{ margin: 0 }}>{tr('Hold the product barcode steady in good light. The code is read on this device.','अच्छी रोशनी में सामान का बारकोड स्थिर रखें। कोड इसी डिवाइस पर पढ़ा जाता है।','Barcode ko camera ke saamne seedha rakhein. Roshni achhi honi chahiye.')}</p>
        <video ref={video} muted autoPlay playsInline style={{ width: '100%', minHeight: 160, maxHeight: '40dvh', objectFit: 'contain', background: '#101827', borderRadius: 12 }} />
        <button type="button" className="btn" onClick={() => setFacing(value => value === 'environment' ? 'user' : 'environment')}>{tr('Switch camera','कैमरा बदलें','Camera badlein')}</button>
        {error && <p role="alert" style={{ color: '#b42318', margin: 0 }}>{error}</p>}
        <label>{tr('Or enter barcode / SKU','या बारकोड / SKU लिखें','Ya barcode / SKU likhein')}<input className="input" aria-label={tr('Barcode or SKU','बारकोड या SKU','Barcode ya SKU')} value={manual} maxLength={80} onChange={event => setManual(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit(manual); } }} autoComplete="off" /></label>
        <button type="button" className="btn btn-primary" disabled={!manual.trim()} onClick={() => void submit(manual)}>{tr('Use this code','यह कोड चुनें','Is code ko use karein')}</button>
      </section>
    </div>}
  </>;
}
