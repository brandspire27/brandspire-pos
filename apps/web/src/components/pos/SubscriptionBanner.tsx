import Link from 'next/link';
import { formatDateTime, isSubscriptionUsable, isTrialExpired } from '@/lib/pos';
import { localizedStatus, posText, type PosLanguage } from '@/lib/pos-i18n';

type Props = {
  status: string;
  endsAt: string | null;
  adminMessage: string | null;
  language?: PosLanguage;
};

export default function SubscriptionBanner({ status, endsAt, adminMessage, language = 'en' }: Props) {
  const t = posText(language);
  const active = isSubscriptionUsable(status, endsAt);
  const trial = status === 'TRIAL';
  const expiredTrial = isTrialExpired(status, endsAt);
  const fallback = trial ? t.subscriptionTrialFallback : active ? t.subscriptionActiveFallback : t.subscriptionBlockedFallback;
  const bannerHeading = expiredTrial ? 'Welcome to Brandspire POS — your trial has expired, subscribe now.' : adminMessage || fallback;

  return (
    <div className={`subscription-banner ${active ? 'subscription-banner-active' : 'subscription-banner-blocked'}`}>
      <div>
        <span className={`status-pill status-${status.toLowerCase()}`}>{localizedStatus(language,status)}</span>
        <h2>{bannerHeading}</h2>
        {endsAt && <p>{trial ? t.trialValidUntil : t.accessValidUntil} <strong>{formatDateTime(endsAt)}</strong></p>}
        {expiredTrial && (
          <div style={{ marginTop: 14 }}>
            <Link href="/owner/subscription" className="btn btn-primary">Subscribe Now</Link>
          </div>
        )}
      </div>
      <div className="subscription-mark">{trial ? t.free : active ? t.live : '!'}</div>
    </div>
  );
}
