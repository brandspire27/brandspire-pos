import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { SupabaseService } from '../common/supabase.service';

const createStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/).optional().or(z.literal('')),
  temporaryPassword: z.string().min(8).max(72)
});

const statusSchema = z.object({ active: z.boolean() });
const passwordSchema = z.object({ temporaryPassword: z.string().min(8).max(72) });

@Injectable()
export class OwnerService {
  constructor(private readonly supabase: SupabaseService) {}

  async listStaff(organizationId: string) {
    const { data: members, error } = await this.supabase.admin
      .from('organization_members')
      .select('user_id, active, created_at')
      .eq('organization_id', organizationId)
      .eq('role', 'STAFF')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    const ids = (members ?? []).map((member) => member.user_id);
    if (ids.length === 0) return [];

    const { data: profiles, error: profileError } = await this.supabase.admin
      .from('staff_profiles')
      .select('user_id, full_name, email, phone, last_login_at')
      .eq('organization_id', organizationId)
      .in('user_id', ids);
    if (profileError) throw new BadRequestException(profileError.message);

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    return (members ?? []).map((member) => {
      const profile = profileMap.get(member.user_id);
      return {
        userId: member.user_id,
        email: profile?.email ?? '',
        fullName: profile?.full_name ?? 'Staff Member',
        phone: profile?.phone ?? '',
        active: member.active,
        createdAt: member.created_at,
        lastLoginAt: profile?.last_login_at ?? null
      };
    });
  }

  async createStaff(organizationId: string, ownerUserId: string, input: unknown) {
    const parsed = createStaffSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid staff details');
    const values = parsed.data;

    const createResult = await this.supabase.admin.auth.admin.createUser({
      email: values.email.toLowerCase(),
      password: values.temporaryPassword,
      email_confirm: true,
      user_metadata: { account_type: 'STAFF', full_name: values.fullName }
    });

    if (createResult.error || !createResult.data.user) {
      if (createResult.error?.message.toLowerCase().includes('already')) {
        throw new ConflictException('A user with this email already exists');
      }
      throw new BadRequestException(createResult.error?.message ?? 'Could not create staff account');
    }

    const staffUserId = createResult.data.user.id;
    const { error: memberError } = await this.supabase.admin.from('organization_members').insert({
      organization_id: organizationId,
      user_id: staffUserId,
      role: 'STAFF',
      active: true
    });

    if (memberError) {
      await this.supabase.admin.auth.admin.deleteUser(staffUserId);
      throw new BadRequestException(memberError.message);
    }

    const { error: profileError } = await this.supabase.admin.from('staff_profiles').insert({
      user_id: staffUserId,
      organization_id: organizationId,
      full_name: values.fullName,
      email: values.email.toLowerCase(),
      phone: values.phone || null,
      created_by: ownerUserId
    });

    if (profileError) {
      await this.supabase.admin.from('organization_members').delete().eq('user_id', staffUserId).eq('organization_id', organizationId);
      await this.supabase.admin.auth.admin.deleteUser(staffUserId);
      throw new BadRequestException(profileError.message);
    }

    await this.supabase.admin.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: ownerUserId,
      actor_role: 'OWNER',
      action: 'STAFF_CREATED',
      entity_type: 'STAFF_USER',
      entity_id: staffUserId,
      summary: { email: values.email.toLowerCase(), full_name: values.fullName }
    });

    return { userId: staffUserId, email: values.email.toLowerCase(), fullName: values.fullName, active: true };
  }

  async setStaffStatus(organizationId: string, ownerUserId: string, staffUserId: string, input: unknown) {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid staff status');

    const { data: member } = await this.supabase.admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF')
      .maybeSingle();
    if (!member) throw new NotFoundException('Staff member not found');

    const { error } = await this.supabase.admin
      .from('organization_members')
      .update({ active: parsed.data.active })
      .eq('organization_id', organizationId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF');
    if (error) throw new BadRequestException(error.message);

    await this.supabase.admin.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: ownerUserId,
      actor_role: 'OWNER',
      action: parsed.data.active ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
      entity_type: 'STAFF_USER',
      entity_id: staffUserId,
      summary: {}
    });
    return { userId: staffUserId, active: parsed.data.active };
  }

  async resetStaffPassword(organizationId: string, ownerUserId: string, staffUserId: string, input: unknown) {
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid temporary password');

    const { data: member } = await this.supabase.admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF')
      .maybeSingle();
    if (!member) throw new NotFoundException('Staff member not found');

    const { error } = await this.supabase.admin.auth.admin.updateUserById(staffUserId, {
      password: parsed.data.temporaryPassword
    });
    if (error) throw new BadRequestException(error.message);

    await this.supabase.admin.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: ownerUserId,
      actor_role: 'OWNER',
      action: 'STAFF_PASSWORD_RESET',
      entity_type: 'STAFF_USER',
      entity_id: staffUserId,
      summary: {}
    });
    return { reset: true };
  }
}
