import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FirebaseAdminService } from '../common/firebase-admin.service';
import { TursoService } from '../database/turso.service';

type AdminRequest = {
  headers: {
    authorization?: string;
  };
  adminUserId?: string;
  adminEmail?: string;
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseAdminService, private readonly database: TursoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing admin access token');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const decoded = await this.firebase.verifyIdToken(token);
    const result = await this.database.execute(
      `SELECT a.user_id FROM platform_admins a
       JOIN user_profiles u ON u.firebase_uid = a.user_id
       WHERE a.user_id = ? AND a.active = 1 AND u.disabled = 0 LIMIT 1`,
      [decoded.uid]
    );
    if (!result.rows.length) {
      throw new UnauthorizedException('Brandspire Admin access required');
    }

    request.adminUserId = decoded.uid;
    request.adminEmail = decoded.email;
    return true;
  }
}
