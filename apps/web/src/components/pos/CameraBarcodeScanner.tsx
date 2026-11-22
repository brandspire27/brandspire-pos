'use client';

import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';

type Props = { onScan: (code: string) => void | Promise<void>; hindi?: boolean; disabled?: boolean; label?: string };

export default function CameraBarcodeScanner({ onScan, hindi = false, disabled = false, label }: Props) {
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
      setError(hindi ? 'Product ka barcode scan karein. Link ya payment QR nahi.' : 'Scan a product barcode, not a website or payment QR.');
      return;
    }
    accepted.current = true;
    stop(); setOpen(false); setBusy(true); setError('');
    try { await onScanRef.current(code); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not use this barcode. Try again.'); }
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
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error(hindi ? 'Camera ke liye HTTPS par app kholein. Barcode neeche likh sakte hain.' : 'Open the app over HTTPS for camera access, or enter the barcode below.');
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
        setError(name === 'NotAllowedError' ? (hindi ? 'Camera permission allow karein, ya barcode likhein.' : 'Allow camera permission, or enter the barcode below.') : name === 'NotFoundError' ? (hindi ? 'Camera nahi mila. Barcode likh sakte hain.' : 'No camera found. Enter the barcode below.') : reason instanceof Error ? reason.message : 'Camera unavailable. Enter the barcode below.');
      }
    })();
    return () => { cancelled = true; stop(); document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility); };
  }, [open, facing, hindi]);

  return <>
    <button ref={trigger} type="button" className="btn" disabled={disabled || busy} onClick={() => { setManual(''); setOpen(true); }}>{busy ? (hindi ? 'Dhoondh rahe hain…' : 'Looking up…') : label || (hindi ? 'Camera se barcode scan' : 'Scan barcode')}</button>
    {!open && error && <span role="alert" style={{ color: '#b42318', display: 'block' }}>{error}</span>}
    {open && <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 5000, background: '#091426b8', display: 'grid', placeItems: 'center', padding: 16 }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label={hindi ? 'Barcode scan karein' : 'Scan product barcode'} style={{ width: 'min(100%, 520px)', maxHeight: '95dvh', overflow: 'auto', background: 'white', color: '#172033', padding: 20, borderRadius: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h2 style={{ margin: 0 }}>{hindi ? 'Barcode scan karein' : 'Scan product barcode'}</h2><button autoFocus className="btn" type="button" onClick={close}>{hindi ? 'Band karein' : 'Close'}</button></div>
        <p style={{ margin: 0 }}>{hindi ? 'Barcode ko camera ke saamne seedha rakhein. Roshni achhi honi chahiye.' : 'Hold the product barcode steady in good light. The code is read on this device.'}</p>
        <video ref={video} muted autoPlay playsInline style={{ width: '100%', minHeight: 160, maxHeight: '40dvh', objectFit: 'contain', background: '#101827', borderRadius: 12 }} />
        <button type="button" className="btn" onClick={() => setFacing(value => value === 'environment' ? 'user' : 'environment')}>{hindi ? 'Camera badlein' : 'Switch camera'}</button>
        {error && <p role="alert" style={{ color: '#b42318', margin: 0 }}>{error}</p>}
        <label>{hindi ? 'Ya barcode / SKU likhein' : 'Or enter barcode / SKU'}<input className="input" aria-label="Barcode or SKU" value={manual} maxLength={80} onChange={event => setManual(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit(manual); } }} autoComplete="off" /></label>
        <button type="button" className="btn btn-primary" disabled={!manual.trim()} onClick={() => void submit(manual)}>{hindi ? 'Is code ko use karein' : 'Use this code'}</button>
      </section>
    </div>}
  </>;
}
