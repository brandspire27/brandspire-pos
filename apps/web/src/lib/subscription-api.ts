import { authenticatedApiRequest } from '@/lib/firebase';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return authenticatedApiRequest<T>(path.replace(/^\/api/, ''), init);
}

export type SubscriptionOverview = {
  pendingOrders: Array<{order_id:string;amount:number;currency:string;created_at:string}>;
  configured: boolean;
  mode: 'sandbox' | 'production';
  current: null | { id:string; plan_id:string|null; status:string; starts_at:string|null; ends_at:string|null; admin_message:string|null; provider:string|null; provider_subscription_id:string|null; provider_status:string|null; billing_cycle:'MONTHLY'|'YEARLY'|null; cancel_at_period_end:boolean; last_payment_at:string|null; next_charge_at:string|null };
  history: Array<Record<string, unknown>>;
  plans: Array<{ id:string; code:string; name:string; monthly_price:number|null; yearly_price:number|null; currency:string; minimum_months:number; features:Record<string,unknown>; provider_monthly_plan_id:string|null; provider_yearly_plan_id:string|null }>;
  transactions: Array<{ id:string; amount:number; currency:string; status:string; method:string|null; provider_payment_id:string|null; created_at:string; captured_at:string|null }>;
};

export function getSubscriptionOverview() {
  return request<{ success:true; data:SubscriptionOverview }>('/api/owner/subscription/overview');
}

export function createSubscriptionCheckout(planId:string, billingCycle:'MONTHLY'|'YEARLY') {
  return request<{ success:true; data:{ sessionId:string; paymentSessionId:string; orderId:string; amount:number; currency:string; billingCycle:'MONTHLY'|'YEARLY' } }>('/api/owner/subscription/checkout', { method:'POST', body:JSON.stringify({ planId, billingCycle }) });
}

export function verifySubscriptionCheckout(input:{ orderId:string }) {
  return request<{ success:true; data:{ verified:boolean; providerStatus:string } }>('/api/owner/subscription/verify', { method:'POST', body:JSON.stringify(input) });
}

export function cancelSubscription(cancelAtPeriodEnd = true) {
  return request<{ success:true; data:{ cancelAtPeriodEnd:boolean; providerStatus:string|null } }>('/api/owner/subscription/cancel', { method:'POST', body:JSON.stringify({ cancelAtPeriodEnd }) });
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: 'sandbox' | 'production' }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: '_self' | '_blank' | string }) => Promise<unknown> | void;
    };
  }
}

let checkoutLoader: Promise<void> | null = null;
export async function ensureCashfreeCheckout(_mode: 'sandbox' | 'production' = 'sandbox') {
  if (typeof window === 'undefined') throw new Error('Checkout is available in the browser only.');
  if (window.Cashfree) return;
  if (!checkoutLoader) checkoutLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => fail(), 15000);
    function fail() {
      window.clearTimeout(timer); script.remove(); checkoutLoader = null;
      reject(new Error('Checkout could not load. Check your connection and try again.'));
    }
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => { if (!window.Cashfree) { fail(); return; } window.clearTimeout(timer); resolve(); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  await checkoutLoader;
}
