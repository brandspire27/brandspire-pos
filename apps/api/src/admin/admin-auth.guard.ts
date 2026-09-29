import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

type AdminRequest = {
  headers: {
    authorization?: string;
  };
  adminUserId?: string;
  adminEmail?: string;
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing admin access token');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const { data, error } = await this.supabase.admin.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { data: adminRecord, error: adminError } = await this.supabase.admin
      .from('platform_admins')
      .select('user_id, active')
      .eq('user_id', data.user.id)
      .eq('active', true)
      .maybeSingle();

    if (adminError || !adminRecord) {
      throw new UnauthorizedException('Brandspire Admin access required');
    }

    request.adminUserId = data.user.id;
    request.adminEmail = data.user.email ?? undefined;
    return true;
  }
}
