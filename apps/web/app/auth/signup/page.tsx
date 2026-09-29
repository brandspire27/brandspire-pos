'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';

const TERMS_VERSION = 'BRANDSPIRE_POS_TERMS_2026_08_27_V1';

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('terms') !== 'on') { setError('Please accept the Brandspire POS Terms & Conditions.'); setLoading(false); return; }
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const rawPhone = String(form.get('phone') ?? '').replace(/\D/g, '');
    const phone = rawPhone.length === 12 && rawPhone.startsWith('91') ? rawPhone.slice(2) : rawPhone;
    if (!/^[6-9]\d{9}$/.test(phone)) { setError('Please enter a valid 10-digit Indian mobile number.'); setLoading(false); return; }
    const supabase = getSupabaseBrowserClient();
    const { data, error: signupError } = await supabase.auth.signUp({
      email, password,
      options: { data: {
        account_type: 'OWNER_APPLICATION', owner_name: String(form.get('ownerName') ?? '').trim(), business_name: String(form.get('businessName') ?? '').trim(), phone,
        business_type: String(form.get('businessType') ?? '').trim(), gstin: String(form.get('gstin') ?? '').trim().toUpperCase(), state: String(form.get('state') ?? '').trim(), address: String(form.get('address') ?? '').trim(), preferred_language: String(form.get('language') ?? 'en'), terms_version: TERMS_VERSION, terms_accepted: true
      }}
    });
    if (signupError) { setError(signupError.message); setLoading(false); return; }
    router.push(data.session ? '/auth/status' : '/auth/status?verify=1');
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
            <div className="field"><label htmlFor="email">Business email</label><input className="input" id="email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="phone">Mobile number</label><input className="input" id="phone" name="phone" inputMode="tel" placeholder="9876543210" required /></div>
            <div className="field"><label htmlFor="password">Create password</label><input className="input" id="password" name="password" type="password" minLength={8} required /></div>
            <div className="field"><label htmlFor="businessType">Business type</label><select className="select" id="businessType" name="businessType" defaultValue="Retail"><option>Retail</option><option>Grocery</option><option>Clothing</option><option>Electronics</option><option>Wholesale</option><option>Service Business</option><option>Other</option></select></div>
            <div className="field"><label htmlFor="gstin">GSTIN <span className="muted">(optional)</span></label><input className="input" id="gstin" name="gstin" maxLength={15} /></div>
            <div className="field"><label htmlFor="state">State</label><input className="input" id="state" name="state" placeholder="Uttar Pradesh" required /></div>
            <div className="field full"><label htmlFor="address">Business address</label><textarea className="textarea" id="address" name="address" required /></div>
            <div className="field full"><label htmlFor="language">Preferred Brandspire POS language</label><select className="select" id="language" name="language" defaultValue="en"><option value="en">English</option><option value="hi">हिंदी</option><option value="hinglish">Hinglish</option></select></div>
          </div>
          <label className="checkbox-row"><input name="terms" type="checkbox" /><span>I confirm that I have read, understood, and agree to the Brandspire POS Terms & Conditions, including account approval, subscription, free-trial, security-deposit, printer-use, printer-return, damage and replacement conditions. <Link href="/terms" target="_blank">Read Terms & Conditions</Link></span></label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><Link className="btn" href="/">Cancel</Link><button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Submitting…' : 'I Agree & Submit Application'}</button></div>
        </form>
      </section>
    </main>
  );
}
