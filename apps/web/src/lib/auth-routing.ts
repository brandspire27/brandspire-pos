import type { SupabaseClient } from '@supabase/supabase-js';

export async function getPostLoginRoute(supabase: SupabaseClient, accessToken: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  try {
    const adminResponse = await fetch(`${apiUrl}/api/admin/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (adminResponse.ok) return '/admin';
  } catch {
    // API may still be starting. Continue with tenant routing.
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return '/';

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('role, active, organization_id')
    .eq('user_id', userId)
    .eq('active', true)
    .limit(1);

  const membership = memberships?.[0];
  if (membership?.role === 'OWNER') return '/owner';
  if (membership?.role === 'STAFF') return '/staff';

  const { data: application } = await supabase
    .from('owner_applications')
    .select('status')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (application) return '/auth/status';
  return '/';
}
