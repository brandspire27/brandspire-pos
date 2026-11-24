'use client';

import { useEffect, useRef, useState } from 'react';
import { usePosLanguage, uiText } from '@/lib/pos-language';

const MAX_DATA_LENGTH = 2_790_000;

async function canvasPhoto(canvas: HTMLCanvasElement, tooDetailed: string) {
  for (const quality of [0.94, 0.86, 0.76, 0.66]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= MAX_DATA_LENGTH) return data;
  }
  throw new Error(tooDetailed);
}

export default function ProductPhotoInput({ disabled, onPhoto, onError }: {
  disabled: boolean; onPhoto: (data: string) => void; onError: (message: string) => void;
}) {
  const language = usePosLanguage();
  const t = (en: string, hi: string, hinglish: string) => uiText(language, en, hi, hinglish);
  const phoneInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const request = useRef(0);
  const [camera, setCamera] = useState(false);
  const [working, setWorking] = useState(false);

  function stop() {
    request.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null; setCamera(false); setWorking(false);
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    if (camera && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => onError(t('Tap the camera preview to start it.','कैमरा शुरू करने के लिए उसके दृश्य पर दबाएँ।','Camera shuru karne ke liye preview par tap karein.')));
    }
  }, [camera]);

  async function start() {
    if (working || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia) { onError(t('Camera preview is unavailable here. Use Take photo on your phone, or choose a photo.','यहाँ कैमरे का दृश्य नहीं खुल सकता। फोन से फोटो लें या फोटो चुनें।','Yahan camera preview nahi khul sakta. Phone se photo lein ya photo chunein.')); return; }
    const id = ++request.current; setWorking(true); onError('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      if (!mounted.current || id !== request.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; setCamera(true);
    } catch { if (mounted.current) onError(t('Camera could not open. Allow camera permission, or use Take photo / Choose file below.','कैमरा नहीं खुला। कैमरे की अनुमति दें या नीचे फोन से फोटो लें / फोटो चुनें इस्तेमाल करें।','Camera nahi khula. Camera permission dein ya neeche Phone se photo lein / Photo chunein istemal karein.')); }
    finally { if (mounted.current) setWorking(false); }
  }
  async function capture() {
    const source = video.current;
    if (!source?.videoWidth || !source.videoHeight) { onError(t('Camera is starting. Wait a moment, then capture.','कैमरा शुरू हो रहा है। थोड़ा रुककर फोटो लें।','Camera shuru ho raha hai. Thoda rukkar photo lein.')); return; }
    setWorking(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2560 / Math.max(source.videoWidth, source.videoHeight));
      canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
      const context = canvas.getContext('2d'); if (!context) throw Error(t('Could not capture photo.','फोटो नहीं ली जा सकी।','Photo nahi li ja saki.'));
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const data = await canvasPhoto(canvas, t('Photo is too detailed. Take two closer photos of separate parts of the list.','फोटो में बहुत विवरण है। सूची के अलग-अलग हिस्सों की दो पास से ली हुई फोटो लें।','Photo mein bahut detail hai. List ke alag-alag hisson ki do paas se photos lein.')); stop(); onPhoto(data);
    } catch (error) { onError(error instanceof Error ? error.message : t('Could not capture photo.','फोटो नहीं ली जा सकी।','Photo nahi li ja saki.')); setWorking(false); }
  }
  async function read(file?: File) {
    if (!file) return;
    stop(); onError(''); setWorking(true);
    let url: string | undefined;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw Error(t('Choose a JPEG, PNG or WebP photo up to 20 MB.','20 MB तक की JPEG, PNG या WebP फोटो चुनें।','20 MB tak ki JPEG, PNG ya WebP photo chunein.'));
      url = URL.createObjectURL(file);
      const image = new Image(); image.src = url; await image.decode();
      const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext('2d'); if (!context) throw Error(t('Could not read photo.','फोटो पढ़ी नहीं जा सकी।','Photo padhi nahi ja saki.'));
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = await canvasPhoto(canvas, t('Photo is too detailed. Take two closer photos of separate parts of the list.','फोटो में बहुत विवरण है। सूची के अलग-अलग हिस्सों की दो पास से ली हुई फोटो लें।','Photo mein bahut detail hai. List ke alag-alag hisson ki do paas se photos lein.')); if (mounted.current) onPhoto(data);
    } catch (error) { if (mounted.current) onError(error instanceof Error ? error.message : t('Could not read photo.','फोटो पढ़ी नहीं जा सकी।','Photo padhi nahi ja saki.')); }
    finally { if (url) URL.revokeObjectURL(url); if (mounted.current) setWorking(false); }
  }
  return <div className="field">
    <div className="inline-actions">
      <button type="button" className="btn" disabled={disabled || working} onClick={() => void start()}>{t('📷 Open camera','📷 कैमरा खोलें','📷 Camera kholein')}</button>
      <button type="button" className="btn" disabled={disabled || working} onClick={() => phoneInput.current?.click()}>{t('Take photo on phone','फोन से फोटो लें','Phone se photo lein')}</button>
      <input ref={phoneInput} hidden aria-label={t('Take photo on phone','फोन से फोटो लें','Phone se photo lein')} type="file" capture="environment" accept="image/jpeg,image/png,image/webp" disabled={disabled || working} onChange={event => { void read(event.target.files?.[0]); event.target.value = ''; }} />
      <button type="button" className="btn" disabled={disabled || working} onClick={() => fileInput.current?.click()}>{t('Choose photo','फोटो चुनें','Photo chunein')}</button>
      <input ref={fileInput} hidden aria-label={t('Choose product photo','उत्पाद की फोटो चुनें','Product ki photo chunein')} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || working} onChange={event => { void read(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
    {camera && <div><video ref={video} muted autoPlay playsInline aria-label={t('Product camera preview','उत्पाद कैमरे का दृश्य','Product camera preview')} onClick={() => void video.current?.play()} style={{ width: '100%', maxHeight: 360, objectFit: 'contain', background: '#111' }} />
      <button type="button" className="btn btn-primary" disabled={working || disabled} onClick={() => void capture()}>{t('Capture photo','फोटो लें','Photo lein')}</button>
      <button type="button" className="btn" onClick={stop}>{t('Close camera','कैमरा बंद करें','Camera band karein')}</button></div>}
    {working && <p role="status">{t('Preparing camera/photo…','कैमरा/फोटो तैयार हो रही है…','Camera/photo taiyar ho rahi hai…')}</p>}
  </div>;
}
