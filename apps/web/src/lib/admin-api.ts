import { authenticatedApiRequest } from '@/lib/firebase';

export async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await authenticatedApiRequest<T>(`/admin${path}`, init);
  } catch (error) {
    if (error instanceof Error && /token|session|unauthorized|access required/i.test(error.message)) {
      throw new Error('ADMIN_SESSION_EXPIRED');
    }
    throw error;
  }
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
