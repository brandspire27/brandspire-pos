import { authenticatedApiRequest } from '@/lib/firebase';

export type MemberRole = 'OWNER' | 'STAFF';

export type CurrentOrganization = {
  organizationId: string;
  organizationName: string;
  role: MemberRole;
  preferredLanguage: 'en' | 'hi' | 'hinglish';
  subscriptionStatus: string;
  endsAt: string | null;
  adminMessage: string | null;
};

const WORKSPACE_CACHE_KEY = 'brandspire_pos_workspace_v1';
const WORKSPACE_CACHE_TTL = 5 * 60 * 1000;

type WorkspaceCache = { savedAt:number; value:CurrentOrganization };

export function getCachedOrganization(): CurrentOrganization | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceCache;
    if (!parsed?.value || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > WORKSPACE_CACHE_TTL) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function clearWorkspaceCache() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(WORKSPACE_CACHE_KEY);
}

function cacheWorkspace(value: CurrentOrganization) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify({ savedAt:Date.now(), value } satisfies WorkspaceCache));
  } catch {
    // Cache is a performance enhancement only.
  }
}

function normalizeWorkspace(row: Record<string,unknown>): CurrentOrganization {
  return {
    organizationId: String(row.organization_id ?? ''),
    organizationName: String(row.organization_name ?? 'Your Business'),
    role: String(row.role ?? 'STAFF') as MemberRole,
    preferredLanguage: String(row.preferred_language ?? 'en') as CurrentOrganization['preferredLanguage'],
    subscriptionStatus: String(row.subscription_status ?? 'PENDING_APPROVAL'),
    endsAt: row.ends_at ? String(row.ends_at) : null,
    adminMessage: row.admin_message ? String(row.admin_message) : null
  };
}

export async function getCurrentOrganization(): Promise<CurrentOrganization | null> {
  try {
    const response = await authenticatedApiRequest<{ success: true; data: CurrentOrganization | null }>('/pos/workspace');
    const current = response.data;
    if (!current?.organizationId) { clearWorkspaceCache(); return null; }
    cacheWorkspace(current);
    return current;
  } catch (error) {
    if (error instanceof Error && /membership|access required|unauthorized|token|session has expired/i.test(error.message)) {
      clearWorkspaceCache();
      return null;
    }
    throw error;
  }
}

export function isSubscriptionUsable(status: string, endsAt: string | null) {
  if (!['TRIAL', 'ACTIVE', 'GRACE_PERIOD'].includes(status)) return false;
  if (!endsAt) return true;
  return new Date(endsAt).getTime() > Date.now();
}

export function isTrialExpired(status: string, endsAt: string | null) {
  return status === 'TRIAL' && !!endsAt && new Date(endsAt).getTime() <= Date.now();
}

export function formatINR(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number.isFinite(number) ? number : 0);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
