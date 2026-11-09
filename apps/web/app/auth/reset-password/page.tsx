'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import PasswordInput from '@/components/auth/PasswordInput';
import { getFirebaseAuth } from '@/lib/firebase';

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const auth = getFirebaseAuth();
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const code = params.get('oobCode');
    void (async () => {
      try {
        if (!code || !mode) throw new Error('This password reset or verification link is invalid or has expired.');
        if (mode === 'resetPassword') await verifyPasswordResetCode(auth, code);
        else if (mode === 'verifyEmail') await applyActionCode(auth, code);
        else throw new Error('This Firebase action link is not supported.');
        if (active) setReady(true);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'This link is invalid or has expired.');
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmPassword') ?? '');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const code = new URLSearchParams(window.location.search).get('oobCode');
      if (!code) throw new Error('This password reset link is invalid or has expired.');
      await confirmPasswordReset(getFirebaseAuth(), code, password);
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update your password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="card auth-card narrow">
        <div className="auth-head">
          <div className="brand-lockup"><span className="brand-mark">BP</span><div className="brand-copy"><strong>Brandspire POS</strong><small>Password recovery</small></div></div>
          <h1>Reset your password.</h1>
          <p>Choose a new password for your Brandspire POS account.</p>
        </div>
        {checking ? <p>Checking your reset link…</p> : success ? (
          <>
            <div className="form-success">Your password has been updated. You can now sign in with your new password.</div>
            <div className="form-actions"><Link className="btn btn-primary" href="/auth/login">Go to login</Link></div>
          </>
        ) : !ready ? (
          <>
            <div className="form-error">{error || 'This reset link is invalid or has expired. Request a new link to continue.'}</div>
            <div className="form-actions"><Link className="btn btn-primary" href="/auth/forgot-password">Request a new link</Link></div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field"><label htmlFor="password">New password</label><PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required /></div>
            <div className="field" style={{ marginTop: 14 }}><label htmlFor="confirmPassword">Confirm new password</label><PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} required /></div>
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions"><Link className="btn" href="/auth/login">Cancel</Link><button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Updating…' : 'Update password'}</button></div>
          </form>
        )}
      </section>
    </main>
  );
}
