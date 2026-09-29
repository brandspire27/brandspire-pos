import { getSupabaseBrowserClient } from '@/lib/supabase';

export async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('ADMIN_SESSION_EXPIRED');

  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const response = await fetch(`${base}/api/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('ADMIN_SESSION_EXPIRED');
  if (!response.ok) throw new Error(body?.message ?? 'Brandspire Admin request failed');
  return body as T;
}

export function adminDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function adminMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value ?? 0));
}
