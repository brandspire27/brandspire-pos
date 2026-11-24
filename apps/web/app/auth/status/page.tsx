'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { authenticatedApiRequest, getFirebaseAuth } from '@/lib/firebase';
import {
  createInstallationCheckout,
  installationPackageName,
  verifyInstallationPayment,
  type InstallationApplication
} from '@/lib/installation-api';
import { ensureCashfreeCheckout } from '@/lib/subscription-api';

function ApplicationStatusPageContent() {
  const searchParams = useSearchParams();
  const installationOrderId = searchParams.get('installation_order_id');
  const [application, setApplication] = useState<InstallationApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [notLoggedIn, setNotLoggedIn] = useState(false);
  const [paymentWorking, setPaymentWorking] = useState(false);
  const [error, setError] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const processedOrder = useRef('');
  const verify = searchParams.get('verify') === '1';

  const refreshApplication = useCallback(async () => {
    const response = await authenticatedApiRequest<{ success: true; data: InstallationApplication | null }>('/auth/owner-application');
    setApplication(response.data);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async user => {
      if (!user) {
        setNotLoggedIn(true);
        setLoading(false);
        return;
      }
      try {
        await refreshApplication();
        if (installationOrderId && processedOrder.current !== installationOrderId) {
          processedOrder.current = installationOrderId;
          try {
            const result = await verifyInstallationPayment(installationOrderId);
            setPaymentMessage(result.data.verified
              ? 'Cashfree payment confirmed. Your application is awaiting approval.'
              : result.data.providerStatus === 'TEST_PAYMENT_SUCCESS'
                ? 'Test payment succeeded, but test payments do not count as a real installation payment.'
                : 'Payment is not confirmed yet. Check the payment status or retry checkout below.');
            if (result.data.verified) window.history.replaceState({}, '', window.location.pathname);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not verify installation payment.');
          }
          await refreshApplication();
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not load your application status.');
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [installationOrderId, refreshApplication]);

  async function continueCashfreePayment() {
    setPaymentWorking(true);
    setError('');
    setPaymentMessage('');
    try {
      const checkout = (await createInstallationCheckout()).data;
      if (checkout.alreadyPaid) {
        setPaymentMessage('Cashfree payment confirmed. Your application is awaiting approval.');
        await refreshApplication();
        return;
      }
      if (!checkout.paymentSessionId) throw new Error('Cashfree did not return a payment session. Please retry shortly.');
      await ensureCashfreeCheckout(checkout.mode);
      if (!window.Cashfree) throw new Error('Cashfree Checkout did not load.');
      await window.Cashfree({ mode: checkout.mode }).checkout({
        paymentSessionId: checkout.paymentSessionId,
        redirectTarget: '_self'
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start Cashfree checkout.');
    } finally {
      setPaymentWorking(false);
    }
  }

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
            <p className="muted">Login to view your Brandspire POS application and installation payment status.</p>
            <div style={{ marginTop: 22 }}><Link className="btn btn-primary" href="/auth/login">Login</Link></div>
          </>
        ) : application ? (
          <>
            <div style={{ marginTop: 26 }}>
              <span className={`status-pill status-${application.status.toLowerCase()}`}>{application.status}</span>
            </div>
            <h1>{application.status === 'PENDING' ? 'Application received!' : application.status === 'APPROVED' ? 'You’re approved!' : 'Application needs attention'}</h1>
            <p className="muted">
              {application.status === 'PENDING' && `The Brandspire Team is reviewing ${application.business_name}. Approval will follow installation payment confirmation or your cash-on-installation selection.`}
              {application.status === 'APPROVED' && 'Your Brandspire POS access has been approved. Login again to enter your Owner dashboard.'}
              {application.status === 'REJECTED' && (application.admin_note || 'Please contact the Brandspire Team for more information.')}
            </p>
            {application.installation_package_code && (
              <div className="installation-status">
                <strong>{installationPackageName(application.installation_package_code)}</strong>
                <span>Installation charge: ₹{Number(application.installation_amount ?? 0).toLocaleString('en-IN')}</span>
                {application.installation_payment_method === 'CASH_ON_INSTALLATION' ? (
                  <span>{application.installation_payment_status === 'COLLECTED' ? 'Cash collected' : 'Cash on installation · due at installation'}</span>
                ) : application.installation_payment_method === 'CASHFREE' ? (
                  <span>{application.installation_payment_status === 'PAID' ? 'Cashfree payment confirmed' : 'Cashfree payment pending'}</span>
                ) : null}
              </div>
            )}
            {paymentMessage && <div className="form-success" role="status">{paymentMessage}</div>}
            {error && <div className="form-error" role="alert">{error}</div>}
            {application.installation_payment_method === 'CASHFREE' &&
              application.installation_payment_status !== 'PAID' &&
              application.status === 'PENDING' && (
                <button className="btn btn-primary" disabled={paymentWorking} onClick={() => void continueCashfreePayment()}>
                  {paymentWorking ? 'Opening Cashfree…' : 'Pay installation charge with Cashfree'}
                </button>
              )}
            <div style={{ marginTop: 22 }}><Link className="btn btn-secondary" href="/auth/login">Continue to Login</Link></div>
          </>
        ) : (
          <>
            {error && <div className="form-error" role="alert">{error}</div>}
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
