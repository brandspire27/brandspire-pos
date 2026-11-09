import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FirebaseAdminService } from '../common/firebase-admin.service';
import { TursoService } from '../database/turso.service';

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
  constructor(private readonly database: TursoService, private readonly firebase: FirebaseAdminService) {}

  async workspace(userId: string, organizationId: string) {
    const result = await this.database.execute(
      `SELECT o.id AS organizationId, o.name AS organizationName, m.role,
        o.preferred_language AS preferredLanguage, s.status AS subscriptionStatus,
        s.ends_at AS endsAt, s.admin_message AS adminMessage
       FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id AND m.user_id = ? AND m.active = 1
       LEFT JOIN subscriptions s ON s.id = (
         SELECT id FROM subscriptions WHERE organization_id = o.id ORDER BY created_at DESC LIMIT 1
       )
       WHERE o.id = ? AND o.status != 'CLOSED' LIMIT 1`,
      [userId, organizationId]
    );
    return (result.rows[0] as unknown as Record<string, unknown> | undefined) ?? null;
  }

  async listStaff(organizationId: string) {
    const result = await this.database.execute(
      `SELECT m.user_id AS userId, p.email, s.full_name AS fullName, s.phone,
        m.active, m.created_at AS createdAt, s.last_login_at AS lastLoginAt
       FROM organization_members m
       JOIN staff_profiles s ON s.user_id = m.user_id AND s.organization_id = m.organization_id
       JOIN user_profiles p ON p.firebase_uid = m.user_id
       WHERE m.organization_id = ? AND m.role = 'STAFF'
       ORDER BY m.created_at DESC`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      ...(row as Record<string, unknown>),
      active: Number((row as Record<string, unknown>).active) === 1
    }));
  }

  async createStaff(organizationId: string, ownerUserId: string, input: unknown) {
    const parsed = createStaffSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid staff details');
    const values = parsed.data;
    const email = values.email.toLowerCase();
    let userId: string;
    try {
      const user = await this.firebase.auth().createUser({
        email,
        password: values.temporaryPassword,
        displayName: values.fullName,
        emailVerified: true
      });
      userId = user.uid;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/email-already-exists') throw new ConflictException('A user with this email already exists');
      throw new BadRequestException('Could not create staff account');
    }

    const transaction = await this.database.transaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO user_profiles(firebase_uid, email, display_name) VALUES (?, ?, ?)`,
        args: [userId, email, values.fullName]
      });
      await tx.execute({
        sql: `INSERT INTO organization_members(id, organization_id, user_id, role, active)
              VALUES (?, ?, ?, 'STAFF', 1)`,
        args: [randomUUID(), organizationId, userId]
      });
      await tx.execute({
        sql: `INSERT INTO staff_profiles(user_id, organization_id, full_name, email, phone, created_by)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [userId, organizationId, values.fullName, email, values.phone || null, ownerUserId]
      });
      await tx.execute({
        sql: `INSERT INTO audit_logs(id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
              VALUES (?, ?, ?, 'OWNER', 'STAFF_CREATED', 'STAFF_USER', ?, ?)`,
        args: [randomUUID(), organizationId, ownerUserId, userId, JSON.stringify({ email, full_name: values.fullName })]
      });
    }).catch(async (error) => {
      await this.firebase.auth().deleteUser(userId).catch(() => undefined);
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ConflictException('A user with this email already exists');
      }
      throw new BadRequestException('Could not create staff account');
    });
    void transaction;
    return { userId, email, fullName: values.fullName, active: true };
  }

  async setStaffStatus(organizationId: string, ownerUserId: string, staffUserId: string, input: unknown) {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid staff status');
    const updated = await this.database.execute(
      `UPDATE organization_members SET active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE organization_id = ? AND user_id = ? AND role = 'STAFF'`,
      [parsed.data.active ? 1 : 0, organizationId, staffUserId]
    );
    if (updated.rowsAffected === 0) throw new NotFoundException('Staff member not found');
    await this.database.execute(
      `INSERT INTO audit_logs(id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
       VALUES (?, ?, ?, 'OWNER', ?, 'STAFF_USER', ?, '{}')`,
      [randomUUID(), organizationId, ownerUserId, parsed.data.active ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED', staffUserId]
    );
    return { userId: staffUserId, active: parsed.data.active };
  }

  async resetStaffPassword(organizationId: string, ownerUserId: string, staffUserId: string, input: unknown) {
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid temporary password');
    const member = await this.database.execute(
      `SELECT 1 FROM organization_members WHERE organization_id = ? AND user_id = ? AND role = 'STAFF' LIMIT 1`,
      [organizationId, staffUserId]
    );
    if (!member.rows.length) throw new NotFoundException('Staff member not found');
    try {
      await this.firebase.auth().updateUser(staffUserId, { password: parsed.data.temporaryPassword });
    } catch {
      throw new BadRequestException('Could not reset staff password');
    }
    await this.database.execute(
      `INSERT INTO audit_logs(id, organization_id, actor_user_id, actor_role, action, entity_type, entity_id, summary)
       VALUES (?, ?, ?, 'OWNER', 'STAFF_PASSWORD_RESET', 'STAFF_USER', ?, '{}')`,
      [randomUUID(), organizationId, ownerUserId, staffUserId]
    );
    return { reset: true };
  }
}
