import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const required = (name: string, value: string | undefined) => {
  const result = (value ?? '').trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
};

export function getFirebaseAuth() {
  const config = {
    apiKey: required('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: required('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: required('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    appId: required('NEXT_PUBLIC_FIREBASE_APP_ID', process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
  };
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export async function getFirebaseIdToken() {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  return user ? user.getIdToken() : null;
}

export async function authenticatedApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('Your session has expired. Please log in again.');
  const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const response = await fetch(`${base}/api${path}`, {
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
