import { authenticatedApiRequest } from '@/lib/firebase';

async function ownerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return authenticatedApiRequest<T>(`/owner${path}`, init);
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
