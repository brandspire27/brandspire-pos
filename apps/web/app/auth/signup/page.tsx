'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { authenticatedApiRequest, getFirebaseAuth } from '@/lib/firebase';
import { createInstallationCheckout, installationPackages, type InstallationPackageCode, type InstallationPaymentMethod } from '@/lib/installation-api';
import { ensureCashfreeCheckout } from '@/lib/subscription-api';
import PasswordInput from '@/components/auth/PasswordInput';

const TERMS_VERSION = 'BRANDSPIRE_POS_TERMS_2026_08_27_V1';

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [applicationSaved, setApplicationSaved] = useState(false);
  const [installationPackageCode, setInstallationPackageCode] = useState<InstallationPackageCode | ''>('');
  const [installationPaymentMethod, setInstallationPaymentMethod] = useState<InstallationPaymentMethod | ''>('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(''); setPhoneError(''); setShowRecovery(false);
    let submitted = false;
    const form = new FormData(event.currentTarget);
    if (form.get('terms') !== 'on') { setError('Please accept the Brandspire POS Terms & Conditions.'); setLoading(false); return; }
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const rawPhone = String(form.get('phone') ?? '').replace(/\D/g, '');
    const phone = rawPhone.length === 12 && rawPhone.startsWith('91') ? rawPhone.slice(2) : rawPhone;
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setPhoneError('Please enter a valid 10-digit Indian mobile number.');
      const input = event.currentTarget.elements.namedItem('phone') as HTMLInputElement;
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setLoading(false); return;
    }
    const packageCode = String(form.get('installationPackageCode') ?? '');
    const paymentMethod = String(form.get('installationPaymentMethod') ?? '');
    if (!installationPackages.some(item => item.code === packageCode)) {
      setError('Please choose an available printer installation package.');
      setLoading(false); return;
    }
    if (paymentMethod !== 'CASHFREE' && paymentMethod !== 'CASH_ON_INSTALLATION') {
      setError('Please choose how to pay the installation charge.');
      setLoading(false); return;
    }
    try {
      const auth = getFirebaseAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password).catch(async reason => {
        if (reason?.code !== 'auth/email-already-in-use') throw reason;
        // Authenticate before resuming an application whose earlier API request failed.
        return signInWithEmailAndPassword(auth, email, password);
      });
      const ownerName = String(form.get('ownerName') ?? '').trim();
      await updateProfile(credential.user, { displayName: ownerName });
      await authenticatedApiRequest('/auth/owner-application', {
        method: 'POST',
        body: JSON.stringify({
          ownerName,
          businessName: String(form.get('businessName') ?? '').trim(),
          phone,
          businessType: String(form.get('businessType') ?? '').trim(),
          gstin: String(form.get('gstin') ?? '').trim().toUpperCase(),
          state: String(form.get('state') ?? '').trim(),
          address: String(form.get('address') ?? '').trim(),
          preferredLanguage: String(form.get('language') ?? 'en'),
          installationPackageCode: packageCode,
          installationPaymentMethod: paymentMethod,
          termsVersion: TERMS_VERSION,
          termsAccepted: true
        })
      });
      submitted = true;
      setApplicationSaved(true);
      await sendEmailVerification(credential.user);
      if (paymentMethod === 'CASHFREE') {
        const checkout = (await createInstallationCheckout()).data;
        if (checkout.alreadyPaid) {
          router.push('/auth/status?verify=1');
          return;
        }
        if (!checkout.paymentSessionId) throw new Error('Cashfree did not return a payment session. Your application is saved; retry payment from application status.');
        await ensureCashfreeCheckout(checkout.mode);
        if (!window.Cashfree) throw new Error('Cashfree Checkout did not load.');
        await window.Cashfree({ mode: checkout.mode }).checkout({
          paymentSessionId: checkout.paymentSessionId,
          redirectTarget: '_self'
        });
        return;
      }
      router.push('/auth/status?verify=1');
    } catch (reason) {
      const code = typeof reason === 'object' && reason !== null && 'code' in reason ? reason.code : '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('The email and password could not be verified. If you already started signup, use your original password or reset it, then return here to finish your application.');
        setShowRecovery(true);
      } else {
        setError(`${reason instanceof Error ? reason.message : 'Could not submit your application.'}${submitted ? ' Your application is saved; continue from application status to retry or check payment.' : ''}`);
      }
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <div className="auth-head">
          <div className="brand-lockup"><span className="brand-mark">BP</span><div className="brand-copy"><strong>Brandspire POS</strong><small>Owner application</small></div></div>
          <h1>Set up your business.</h1>
          <p>Tell us the basics. After review, the Brandspire Admin Team activates your approved trial or subscription timeline.</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="field"><label htmlFor="ownerName">Owner name</label><input className="input" id="ownerName" name="ownerName" required minLength={2} /></div>
            <div className="field"><label htmlFor="businessName">Business name</label><input className="input" id="businessName" name="businessName" required minLength={2} /></div>
            <div className="field"><label htmlFor="email">Business email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
            <div className="field"><label htmlFor="phone">Mobile number (+91)</label><input className="input" id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Enter 10-digit mobile number" aria-invalid={!!phoneError} aria-describedby={phoneError ? 'phone-hint phone-error' : 'phone-hint'} onChange={() => setPhoneError('')} required /><small id="phone-hint">Indian mobile number, for example 9876543210.</small>{phoneError && <small id="phone-error" className="form-error" role="alert">{phoneError}</small>}</div>
            <div className="field"><label htmlFor="password">Create password</label><PasswordInput id="password" name="password" minLength={8} required /></div>
            <div className="field"><label htmlFor="businessType">Business type</label><select className="select" id="businessType" name="businessType" defaultValue="Retail"><option>Retail</option><option>Grocery</option><option>Clothing</option><option>Electronics</option><option>Wholesale</option><option>Service Business</option><option>Other</option></select></div>
            <div className="field"><label htmlFor="gstin">GSTIN <span className="muted">(optional)</span></label><input className="input" id="gstin" name="gstin" maxLength={15} /></div>
            <div className="field"><label htmlFor="state">State</label><input className="input" id="state" name="state" placeholder="Uttar Pradesh" required /></div>
            <div className="field full"><label htmlFor="address">Business address</label><textarea className="textarea" id="address" name="address" required /></div>
            <div className="field full"><label htmlFor="language">Preferred Brandspire POS language</label><select className="select" id="language" name="language" defaultValue="en"><option value="en">English</option><option value="hi">हिंदी</option><option value="hinglish">Hinglish</option></select></div>
          </div>
          <section className="installation-options" aria-labelledby="installation-heading">
            <div>
              <span className="page-kicker">INSTALLATION</span>
              <h2 id="installation-heading">Choose a printer package</h2>
              <p>Select the package and payment method to complete your application. Cashfree payments are verified before approval; cash is collected at installation.</p>
            </div>
            <div className="installation-package-grid" role="radiogroup" aria-label="Printer installation package">
              {installationPackages.map(item => (
                <label className={`installation-package${installationPackageCode === item.code ? ' selected' : ''}`} key={item.code}>
                  <input
                    type="radio"
                    name="installationPackageCode"
                    value={item.code}
                    checked={installationPackageCode === item.code}
                    onChange={() => setInstallationPackageCode(item.code)}
                    required
                  />
                  <span><strong>{item.name}</strong><b>₹{item.amount.toLocaleString('en-IN')}</b></span>
                </label>
              ))}
            </div>
            <div className="installation-coming-soon"><strong>A4 printer options</strong><span>Coming soon</span></div>
            <fieldset className="installation-payment-methods">
              <legend>Installation payment</legend>
              <label>
                <input type="radio" name="installationPaymentMethod" value="CASHFREE" checked={installationPaymentMethod === 'CASHFREE'} onChange={() => setInstallationPaymentMethod('CASHFREE')} required />
                <span><strong>Pay now with Cashfree</strong><small>Complete payment securely during signup.</small></span>
              </label>
              <label>
                <input type="radio" name="installationPaymentMethod" value="CASH_ON_INSTALLATION" checked={installationPaymentMethod === 'CASH_ON_INSTALLATION'} onChange={() => setInstallationPaymentMethod('CASH_ON_INSTALLATION')} required />
                <span><strong>Cash on installation</strong><small>Pay the selected charge when the printer is installed.</small></span>
              </label>
            </fieldset>
          </section>
          <label className="checkbox-row"><input name="terms" type="checkbox" /><span>I confirm that I have read, understood, and agree to the Brandspire POS Terms & Conditions, including account approval, subscription, free-trial, security-deposit, printer-use, printer-return, damage and replacement conditions. <Link href="/terms" target="_blank">Read Terms & Conditions</Link></span></label>
          {error && <div className="form-error" role="alert">{error}{showRecovery && <p><Link href="/auth/forgot-password" target="_blank" rel="noopener noreferrer">Reset password in a new tab</Link></p>}{applicationSaved && <p><Link href="/auth/status?verify=1">Open application status</Link></p>}</div>}
          <div className="form-actions"><Link className="btn" href="/">Cancel</Link><button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Submitting…' : installationPaymentMethod === 'CASHFREE' ? 'Pay & Submit Application' : 'Submit Application for Approval'}</button></div>
        </form>
      </section>
    </main>
  );
}
