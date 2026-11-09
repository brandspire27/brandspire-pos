import { authenticatedApiRequest } from '@/lib/firebase';

export async function getPostLoginRoute() {
  const response = await authenticatedApiRequest<{ success: true; data: { route: string } }>('/auth/route');
  return response.data.route;
}
