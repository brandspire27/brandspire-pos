'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getPostLoginRoute } from '@/lib/auth-routing';
import PasswordInput from '@/components/auth/PasswordInput';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      const route = await getPostLoginRoute();
      router.push(route);
    } catch (reason) {
      await signOut(getFirebaseAuth()).catch(() => undefined);
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="card auth-card narrow">
        <div className="auth-head">
          <div className="brand-lockup"><span className="brand-mark">BP</span><div className="brand-copy"><strong>Brandspire POS</strong><small>Secure workspace</small></div></div>
          <h1>Welcome back.</h1>
          <p>Sign in once. Brandspire POS automatically takes you to the correct Admin, Owner or Staff workspace.</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field"><label htmlFor="email">Email address</label><input autoFocus className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field" style={{ marginTop: 14 }}><label htmlFor="password">Password</label><PasswordInput id="password" name="password" autoComplete="current-password" required /></div>
          <div style={{ marginTop: 10, textAlign: 'right' }}><Link href="/auth/forgot-password" style={{ fontWeight: 700, color: '#2343af' }}>Forgot password?</Link></div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><Link className="btn" href="/">Back</Link><button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Signing in…' : 'Login securely'}</button></div>
        </form>
        <div className="auth-split-note">Owner applications are reviewed by the Brandspire Admin Team before business access is activated.</div>
        <p className="center muted" style={{ marginTop: 20 }}>New business owner? <Link href="/auth/signup" style={{ fontWeight: 800, color: '#2343af' }}>Apply for access</Link></p>
      </section>
    </main>
  );
}
