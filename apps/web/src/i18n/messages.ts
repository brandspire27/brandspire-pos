export type AppLanguage = 'en' | 'hi' | 'hinglish';

export const messages = {
  en: {
    createBill: 'Create Bill',
    addCustomer: 'Add Customer',
    addProduct: 'Add Product',
    subscriptionActive: 'Your Brandspire POS subscription is active.'
  },
  hi: {
    createBill: 'बिल बनाएं',
    addCustomer: 'ग्राहक जोड़ें',
    addProduct: 'प्रोडक्ट जोड़ें',
    subscriptionActive: 'आपकी Brandspire POS सदस्यता सक्रिय है।'
  },
  hinglish: {
    createBill: 'Bill Banaye',
    addCustomer: 'Customer Add Kare',
    addProduct: 'Product Add Kare',
    subscriptionActive: 'Aapka Brandspire POS subscription active hai.'
  }
} as const;
