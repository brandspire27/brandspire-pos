import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FirebaseAdminService } from '../common/firebase-admin.service';
import { TursoService } from '../database/turso.service';

export type PosRequest = {
  headers: { authorization?: string };
  ownerUserId?: string;
  organizationId?: string;
  ownerRole?: 'OWNER' | 'STAFF';
};

@Injectable()
export class PosAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseAdminService, private readonly database: TursoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PosRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing Firebase ID token');
    const decoded = await this.firebase.verifyIdToken(authorization.slice(7).trim());
    const result = await this.database.execute(
      `SELECT m.organization_id, m.role FROM organization_members m
       JOIN user_profiles u ON u.firebase_uid = m.user_id
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.role IN ('OWNER', 'STAFF') AND m.active = 1 AND u.disabled = 0
         AND o.status = 'ACTIVE' LIMIT 1`,
      [decoded.uid]
    );
    const membership = result.rows[0] as unknown as { organization_id: string; role: 'OWNER' | 'STAFF' } | undefined;
    if (!membership) throw new UnauthorizedException('Active Brandspire POS membership required');
    request.ownerUserId = decoded.uid;
    request.organizationId = membership.organization_id;
    request.ownerRole = membership.role;
    return true;
  }
}
