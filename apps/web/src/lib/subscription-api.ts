import { getSupabaseBrowserClient } from '@/lib/supabase';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please log in again.');
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message ?? body?.error?.message ?? 'Subscription request failed');
  return body as T;
}

export type SubscriptionOverview = {
  configured: boolean;
  current: null | { id:string; plan_id:string|null; status:string; starts_at:string|null; ends_at:string|null; admin_message:string|null; provider:string|null; provider_subscription_id:string|null; provider_status:string|null; billing_cycle:'MONTHLY'|'YEARLY'|null; cancel_at_period_end:boolean; last_payment_at:string|null; next_charge_at:string|null };
  history: Array<Record<string, unknown>>;
  plans: Array<{ id:string; code:string; name:string; monthly_price:number|null; yearly_price:number|null; currency:string; minimum_months:number; features:Record<string,unknown>; provider_monthly_plan_id:string|null; provider_yearly_plan_id:string|null }>;
  transactions: Array<{ id:string; amount:number; currency:string; status:string; method:string|null; provider_payment_id:string|null; created_at:string; captured_at:string|null }>;
};

export function getSubscriptionOverview() {
  return request<{ success:true; data:SubscriptionOverview }>('/api/owner/subscription/overview');
}

export function createSubscriptionCheckout(planId:string, billingCycle:'MONTHLY'|'YEARLY') {
  return request<{ success:true; data:{ sessionId:string; keyId:string; subscriptionId:string; planName:string; planCode:string; amount:number; currency:string; billingCycle:'MONTHLY'|'YEARLY'; ownerEmail:string } }>('/api/owner/subscription/checkout', { method:'POST', body:JSON.stringify({ planId, billingCycle }) });
}

export function verifySubscriptionCheckout(input:{ paymentId:string; subscriptionId:string; signature:string }) {
  return request<{ success:true; data:{ verified:boolean; providerStatus:string; subscription:{ subscriptionId:string|null; status:string|null } } }>('/api/owner/subscription/verify', { method:'POST', body:JSON.stringify(input) });
}

export function cancelSubscription(cancelAtPeriodEnd = true) {
  return request<{ success:true; data:{ cancelAtPeriodEnd:boolean; providerStatus:string|null } }>('/api/owner/subscription/cancel', { method:'POST', body:JSON.stringify({ cancelAtPeriodEnd }) });
}

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event:string, callback:(data:unknown)=>void) => void } }
}

export async function ensureRazorpayCheckout() {
  if (typeof window === 'undefined') throw new Error('Checkout is available in the browser only.');
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-brandspire-razorpay="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once:true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout')), { once:true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.brandspireRazorpay = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout'));
    document.head.appendChild(script);
  });
}
