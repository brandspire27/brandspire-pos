import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

type OwnerRequest = {
  headers: { authorization?: string };
  ownerUserId?: string;
  organizationId?: string;
  ownerEmail?: string;
};

@Injectable()
export class OwnerAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Owner access token');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const { data, error } = await this.supabase.admin.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid or expired session');

    const { data: membership, error: membershipError } = await this.supabase.admin
      .from('organization_members')
      .select('organization_id, role, active')
      .eq('user_id', data.user.id)
      .eq('role', 'OWNER')
      .eq('active', true)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new UnauthorizedException('Brandspire POS Owner access required');
    }

    request.ownerUserId = data.user.id;
    request.organizationId = membership.organization_id;
    request.ownerEmail = data.user.email ?? undefined;
    return true;
  }
}
