import { getSupabaseBrowserClient } from '@/lib/supabase';

async function ownerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please log in again.');

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const response = await fetch(`${apiBase}/api/owner${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message ?? body?.error?.message ?? 'Brandspire POS request failed';
    throw new Error(Array.isArray(message) ? message[0] : message);
  }
  return body as T;
}

export type StaffRecord = {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export async function listStaff() {
  return ownerRequest<{ success: true; data: StaffRecord[] }>('/staff');
}

export async function createStaff(input: { fullName: string; email: string; phone?: string; temporaryPassword: string }) {
  return ownerRequest<{ success: true; data: StaffRecord }>('/staff', { method: 'POST', body: JSON.stringify(input) });
}

export async function setStaffStatus(userId: string, active: boolean) {
  return ownerRequest<{ success: true; data: { userId: string; active: boolean } }>(`/staff/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
}

export async function resetStaffPassword(userId: string, temporaryPassword: string) {
  return ownerRequest<{ success: true; data: { reset: true } }>(`/staff/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ temporaryPassword }) });
}

export async function askBusinessInsights(query: string) {
  return ownerRequest<{ success: true; data: { configured: boolean; answer: string | null; message?: string; snapshotPeriodDays?: number } }>('/assist/insights', { method: 'POST', body: JSON.stringify({ query }) });
}
