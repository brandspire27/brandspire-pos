'use client';

import { uiText, usePosLanguage } from '@/lib/pos-language';

export type CustomerDetails = { name: string; phone: string };

export default function CheckoutCustomer({ value, onChange, disabled = false, offline = false }: {
  value: CustomerDetails;
  onChange: (value: CustomerDetails) => void;
  disabled?: boolean;
  offline?: boolean;
}) {
  const language = usePosLanguage();
  const tr = (en: string, hi: string, hinglish: string) => uiText(language, en, hi, hinglish);

  return <div className="checkout-customer">
    <div className="checkout-customer-grid">
      <div className="field">
        <label htmlFor="checkout-customer-name">{tr('Customer name','ग्राहक का नाम','Customer ka naam')}</label>
        <input
          id="checkout-customer-name"
          className="input"
          autoComplete="name"
          maxLength={160}
          value={value.name}
          disabled={disabled}
          onChange={event => onChange({ ...value, name: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="checkout-customer-phone">{tr('Mobile number','मोबाइल नंबर','Mobile number')}</label>
        <input
          id="checkout-customer-phone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          value={value.phone}
          disabled={disabled}
          onChange={event => onChange({ ...value, phone: event.target.value })}
        />
      </div>
    </div>
    <p className="checkout-customer-note">
      {offline ? tr(
        'New customer details need an internet connection to save. Select a saved customer or use Walk-in for offline bills.',
        'नए ग्राहक का विवरण सेव करने के लिए इंटरनेट चाहिए। ऑफलाइन बिल के लिए सेव ग्राहक चुनें या Walk-in रखें।',
        'Naye customer ki details save karne ke liye internet chahiye. Offline bill ke liye saved customer chunein ya Walk-in rakhein.'
      ) : tr(
        'Optional: enter both details to save the customer with this bill. Leave both blank for Walk-in.',
        'वैकल्पिक: ग्राहक को इस बिल के साथ सेव करने के लिए दोनों जानकारी भरें। Walk-in के लिए दोनों खाली छोड़ें।',
        'Optional: customer ko is bill ke saath save karne ke liye dono details bharein. Walk-in ke liye dono khaali chhodein.'
      )}
    </p>
  </div>;
}
