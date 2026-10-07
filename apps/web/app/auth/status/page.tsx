'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type Application = {
  business_name: string;
  owner_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_note: string | null;
  created_at: string;
};

function ApplicationStatusPageContent() {
  const searchParams = useSearchParams();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [notLoggedIn, setNotLoggedIn] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setNotLoggedIn(true);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('owner_applications')
        .select('business_name, owner_name, status, admin_note, created_at')
        .maybeSingle();

      setApplication((data as Application | null) ?? null);
      setLoading(false);
    }

    load();
  }, []);

  const verify = searchParams.get('verify') === '1';

  return (
    <main className="auth-wrap">
      <section className="card auth-card narrow center">
        <div className="brand">Brandspire POS <small>A Brandspire Product</small></div>

        {verify && notLoggedIn ? (
          <>
            <h1 style={{ marginTop: 30 }}>Check your email</h1>
            <p className="muted">Your application has been received. Verify your email address, then login to track approval status.</p>
            <div style={{ marginTop: 22 }}><Link className="btn btn-primary" href="/auth/login">Go to Login</Link></div>
          </>
        ) : loading ? (
          <p style={{ marginTop: 28 }}>Checking your application...</p>
        ) : notLoggedIn ? (
          <>
            <h1 style={{ marginTop: 30 }}>Sign in to continue</h1>
            <p className="muted">Login to view your Brandspire POS application status.</p>
            <div style={{ marginTop: 22 }}><Link className="btn btn-primary" href="/auth/login">Login</Link></div>
          </>
        ) : application ? (
          <>
            <div style={{ marginTop: 26 }}>
              <span className={`status-pill status-${application.status.toLowerCase()}`}>{application.status}</span>
            </div>
            <h1>{application.status === 'PENDING' ? 'Application received!' : application.status === 'APPROVED' ? 'You’re approved!' : 'Application needs attention'}</h1>
            <p className="muted">
              {application.status === 'PENDING' && `The Brandspire Team is reviewing ${application.business_name}. You’ll be able to start once your account is approved.`}
              {application.status === 'APPROVED' && 'Your Brandspire POS access has been approved. Login again to enter your Owner dashboard.'}
              {application.status === 'REJECTED' && (application.admin_note || 'Please contact the Brandspire Team for more information.')}
            </p>
            <div style={{ marginTop: 22 }}><Link className="btn btn-primary" href="/auth/login">Continue to Login</Link></div>
          </>
        ) : (
          <>
            <h1 style={{ marginTop: 30 }}>No application found</h1>
            <p className="muted">We could not find an Owner application for this account.</p>
            <div style={{ marginTop: 22 }}><Link className="btn" href="/auth/signup">Create Application</Link></div>
          </>
        )}
      </section>
    </main>
  );
}

export default function ApplicationStatusPage() {
  return <Suspense fallback={<main className="auth-wrap"><section className="card auth-card narrow center"><p style={{ marginTop: 28 }}>Checking your application...</p></section></main>}><ApplicationStatusPageContent /></Suspense>;
}
