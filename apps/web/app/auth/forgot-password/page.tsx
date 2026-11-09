'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email, { url: `${window.location.origin}/auth/reset-password` });
      setSent(true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not send the password reset email.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="card auth-card narrow">
        <div className="auth-head">
          <div className="brand-lockup"><span className="brand-mark">BP</span><div className="brand-copy"><strong>Brandspire POS</strong><small>Password recovery</small></div></div>
          <h1>Forgot your password?</h1>
          <p>Enter the email address for your account and we’ll send you a password reset link.</p>
        </div>
        {sent ? (
          <div className="form-success">If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field"><label htmlFor="email">Email address</label><input autoFocus className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions"><Link className="btn" href="/auth/login">Back to login</Link><button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Sending…' : 'Send reset link'}</button></div>
          </form>
        )}
        {sent && <div className="form-actions"><Link className="btn btn-primary" href="/auth/login">Back to login</Link></div>}
      </section>
    </main>
  );
}
