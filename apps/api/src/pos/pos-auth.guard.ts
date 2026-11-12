import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { FirebaseAdminService } from '../common/firebase-admin.service';
import { TursoService } from '../database/turso.service';

export type PosRequest = {
  method?: string;
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
    if (!['GET','HEAD','OPTIONS'].includes(request.method ?? 'POST')) {
      const subscription = await this.database.execute(
        'SELECT status, ends_at FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1',
        [membership.organization_id]
      );
      const current = subscription.rows[0] as {status?:string;ends_at?:string|null}|undefined;
      if(!current || !['TRIAL','ACTIVE','GRACE_PERIOD'].includes(current.status??'') ||
        (current.ends_at != null && !(new Date(current.ends_at).getTime()>Date.now()))) {
        throw new ForbiddenException('Subscription expired or inactive. Existing records remain available; renew before creating or changing bills/products. Pending device bills are retained.');
      }
    }
    request.ownerUserId = decoded.uid;
    request.organizationId = membership.organization_id;
    request.ownerRole = membership.role;
    return true;
  }
}
