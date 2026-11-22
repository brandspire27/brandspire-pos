'use client';

import { useEffect, useState } from 'react';

type Props = { hindi: boolean; offline: boolean; review: string };

/** Optional spoken guidance. Speech availability never gates saving a bill. */
export default function SimpleBillingGuide({ hindi, offline, review }: Props) {
  const [message, setMessage] = useState('');
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);
  function speak() {
    if (!('speechSynthesis' in window)) {
      setMessage(hindi ? 'इस डिवाइस पर आवाज उपलब्ध नहीं है। नीचे बिल जाँचें।' : 'Audio is unavailable on this device. Review the bill below.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(review);
    utterance.lang = hindi ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.85;
    utterance.onerror = () => setMessage(hindi ? 'आवाज नहीं चल सकी। बिल पढ़कर जाँचें या मदद लें।' : 'Audio could not play. Review the visible bill or ask for help.');
    setMessage('');
    window.speechSynthesis.speak(utterance);
  }
  return <section className="card simple-billing-guide" aria-label={hindi ? 'बिल बनाने में मदद' : 'Checkout guidance'}>
    <ol>
      <li>{hindi ? 'सामान चुनें' : 'Choose items'}</li>
      <li>{hindi ? 'मात्रा और रकम जाँचें' : 'Check quantity and amount'}</li>
      <li>{hindi ? 'भुगतान चुनें, फिर सेव करें' : 'Choose payment, then save'}</li>
    </ol>
    <p>{offline
      ? (hindi ? 'ऑफलाइन: केवल नकद या उधार। सेव किए बिल का सिंक बाकी रहेगा।' : 'Offline: cash or credit only. Saved bills still need syncing.')
      : (hindi ? 'सेव होने का संदेश आने तक रुकें। प्रिंट न निकले तो उसी बिल को दोबारा खोलें।' : 'Wait for save confirmation. If printing fails, reopen the same bill.')}</p>
    <p>{review}</p>
    <button type="button" className="btn" onClick={speak}>{hindi ? 'बिल सुनें' : 'Listen to bill'}</button>
    <button type="button" className="btn" onClick={() => window.speechSynthesis?.cancel()}>{hindi ? 'आवाज रोकें' : 'Stop audio'}</button>
    <p className="muted">{hindi ? 'आवाज की उपलब्धता फोन या ब्राउज़र पर निर्भर है। सुनने से बिल सेव नहीं होगा।' : 'Audio availability depends on your device/browser. Listening does not save the bill.'}</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
