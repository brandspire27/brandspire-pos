import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';
import { TursoService } from '../database/turso.service';

export type FirebaseRequest = {
  headers: { authorization?: string };
  firebaseUid?: string;
  firebaseEmail?: string;
  firebaseEmailVerified?: boolean;
  firebaseName?: string;
};

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseAdminService, private readonly database: TursoService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FirebaseRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing Firebase ID token');
    const decoded = await this.firebase.verifyIdToken(authorization.slice(7).trim());
    if (!decoded.email) throw new UnauthorizedException('A verified email address is required');
    const profile = await this.database.execute(
      `SELECT disabled FROM user_profiles WHERE firebase_uid = ? LIMIT 1`,
      [decoded.uid]
    );
    if (Number((profile.rows[0] as { disabled?: number } | undefined)?.disabled ?? 0) === 1) {
      throw new UnauthorizedException('Account is disabled');
    }
    await this.database.execute(
      `INSERT INTO user_profiles(firebase_uid, email, display_name) VALUES (?, ?, ?)
       ON CONFLICT(firebase_uid) DO UPDATE SET email = excluded.email,
       display_name = COALESCE(excluded.display_name, user_profiles.display_name),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      [decoded.uid, decoded.email, decoded.name ?? null]
    );
    request.firebaseUid = decoded.uid;
    request.firebaseEmail = decoded.email;
    request.firebaseEmailVerified = decoded.email_verified === true;
    request.firebaseName = decoded.name;
    return true;
  }
}
