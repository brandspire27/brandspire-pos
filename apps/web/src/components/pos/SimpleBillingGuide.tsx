'use client';

import { useEffect, useState } from 'react';
import { uiText, usePosLanguage } from '@/lib/pos-language';

type Props = { hindi: boolean; offline: boolean; review: string };

/** Optional spoken guidance. Speech availability never gates saving a bill. */
export default function SimpleBillingGuide({ hindi, offline, review }: Props) {
  const language=usePosLanguage();
  const tr=(en:string,hi:string,hinglish:string)=>uiText(language,en,hi,hinglish);
  const [message, setMessage] = useState('');
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);
  function speak() {
    if (!('speechSynthesis' in window)) {
      setMessage(tr('Audio is unavailable on this device. Review the bill below.','इस डिवाइस पर आवाज उपलब्ध नहीं है। नीचे बिल जाँचें।','Is device par awaaz available nahi hai. Neeche bill check karein.'));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(review);
    utterance.lang = language==='en' ? 'en-IN' : 'hi-IN';
    utterance.rate = 0.85;
    utterance.onerror = () => setMessage(tr('Audio could not play. Review the visible bill or ask for help.','आवाज नहीं चल सकी। बिल पढ़कर जाँचें या मदद लें।','Awaaz nahi chal saki. Bill padhkar check karein ya madad lein.'));
    setMessage('');
    window.speechSynthesis.speak(utterance);
  }
  return <section className="card simple-billing-guide" aria-label={tr('Checkout guidance','बिल बनाने में मदद','Bill banane mein madad')}>
    <ol>
      <li>{tr('Choose items','सामान चुनें','Samaan chunein')}</li>
      <li>{tr('Check quantity and amount','मात्रा और रकम जाँचें','Matra aur rakam check karein')}</li>
      <li>{tr('Choose payment, then save','भुगतान चुनें, फिर सेव करें','Payment chunein, phir save karein')}</li>
    </ol>
    <p>{offline
      ? tr('Offline: cash or credit only. Saved bills still need syncing.','ऑफलाइन: केवल नकद या उधार। सेव किए बिल का सिंक बाकी रहेगा।','Offline: sirf cash ya udhaar. Save kiye bill ka sync baaki rahega.')
      : tr('Wait for save confirmation. If printing fails, reopen the same bill.','सेव होने का संदेश आने तक रुकें। प्रिंट न निकले तो उसी बिल को दोबारा खोलें।','Save hone ka message aane tak rukein. Print na nikle toh wahi bill dobara kholein.')}</p>
    <p>{review}</p>
    <button type="button" className="btn" onClick={speak}>{tr('Listen to bill','बिल सुनें','Bill sunein')}</button>
    <button type="button" className="btn" onClick={() => window.speechSynthesis?.cancel()}>{tr('Stop audio','आवाज रोकें','Awaaz rokein')}</button>
    <p className="muted">{tr('Audio availability depends on your device/browser. Listening does not save the bill.','आवाज की उपलब्धता फोन या ब्राउज़र पर निर्भर है। सुनने से बिल सेव नहीं होगा।','Awaaz ki suvidha phone ya browser par nirbhar hai. Sunne se bill save nahi hoga.')}</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
