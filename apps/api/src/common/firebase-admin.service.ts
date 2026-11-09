import { Injectable, UnauthorizedException } from '@nestjs/common';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  private readonly app: App;

  constructor() {
    const projectId = (process.env.FIREBASE_PROJECT_ID ?? '').trim();
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');

    const existing = getApps().find((candidate) => candidate.options.projectId === projectId);
    if (existing) {
      this.app = existing;
      return;
    }

    const serviceAccountJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
    if (serviceAccountJson) {
      let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };
      try {
        serviceAccount = JSON.parse(serviceAccountJson);
      } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON');
      }
      if (
        serviceAccount.project_id !== projectId ||
        !serviceAccount.client_email ||
        !serviceAccount.private_key
      ) {
        throw new Error('Firebase service account must match FIREBASE_PROJECT_ID and include its credentials');
      }
      this.app = initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId });
      return;
    }

    this.app = initializeApp({ credential: applicationDefault(), projectId });
  }

  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    try {
      return await getAuth(this.app).verifyIdToken(token, true);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }
  }

  auth() {
    return getAuth(this.app);
  }
}
