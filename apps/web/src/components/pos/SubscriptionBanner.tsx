import { formatDateTime, isSubscriptionUsable } from '@/lib/pos';
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
  const fallback = trial ? t.subscriptionTrialFallback : active ? t.subscriptionActiveFallback : t.subscriptionBlockedFallback;

  return (
    <div className={`subscription-banner ${active ? 'subscription-banner-active' : 'subscription-banner-blocked'}`}>
      <div>
        <span className={`status-pill status-${status.toLowerCase()}`}>{localizedStatus(language,status)}</span>
        <h2>{adminMessage || fallback}</h2>
        {endsAt && <p>{trial ? t.trialValidUntil : t.accessValidUntil} <strong>{formatDateTime(endsAt)}</strong></p>}
      </div>
      <div className="subscription-mark">{trial ? t.free : active ? t.live : '!'}</div>
    </div>
  );
}
