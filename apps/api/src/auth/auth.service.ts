import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FirebaseRequest } from '../common/firebase-auth.guard';
import { TursoService } from '../database/turso.service';

const applicationSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/),
  businessType: z.string().trim().max(100).optional().default(''),
  gstin: z.string().trim().max(15).optional().default(''),
  state: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(500),
  preferredLanguage: z.enum(['en', 'hi', 'hinglish']),
  termsVersion: z.string().trim().min(1).max(100),
  termsAccepted: z.literal(true)
});

@Injectable()
export class AuthService {
  constructor(private readonly database: TursoService) {}

  async postLoginRoute(uid: string) {
    const admin = await this.database.execute(`SELECT 1 FROM platform_admins WHERE user_id = ? AND active = 1 LIMIT 1`, [uid]);
    if (admin.rows.length) return { route: '/admin' };
    const member = await this.database.execute(
      `SELECT role FROM organization_members WHERE user_id = ? AND active = 1 ORDER BY CASE role WHEN 'OWNER' THEN 0 ELSE 1 END LIMIT 1`,
      [uid]
    );
    const role = (member.rows[0] as { role?: string } | undefined)?.role;
    if (role === 'OWNER') return { route: '/owner' };
    if (role === 'STAFF') return { route: '/staff' };
    const application = await this.database.execute(`SELECT 1 FROM owner_applications WHERE auth_user_id = ? LIMIT 1`, [uid]);
    return { route: application.rows.length ? '/auth/status' : '/' };
  }

  async submitOwnerApplication(request: FirebaseRequest, input: unknown) {
    const parsed = applicationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid owner application');
    const values = parsed.data;
    const existing = await this.database.execute(`SELECT id FROM owner_applications WHERE auth_user_id = ? LIMIT 1`, [request.firebaseUid!]);
    if (existing.rows.length) return { applicationId: (existing.rows[0] as unknown as { id: string }).id, alreadySubmitted: true };
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.database.transaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO user_profiles(firebase_uid, email, display_name) VALUES (?, ?, ?)
              ON CONFLICT(firebase_uid) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        args: [request.firebaseUid!, request.firebaseEmail!, values.ownerName]
      });
      await tx.execute({
        sql: `INSERT INTO owner_applications(
          id, auth_user_id, email, owner_name, business_name, phone, business_type, gstin, state, address,
          preferred_language, terms_version, terms_accepted_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        args: [id, request.firebaseUid!, request.firebaseEmail!, values.ownerName, values.businessName, values.phone,
          values.businessType || null, values.gstin.toUpperCase() || null, values.state, values.address,
          values.preferredLanguage, values.termsVersion, now]
      });
      await tx.execute({
        sql: `INSERT INTO terms_acceptances(id, user_id, application_id, terms_version, accepted_at) VALUES (?, ?, ?, ?, ?)`,
        args: [randomUUID(), request.firebaseUid!, id, values.termsVersion, now]
      });
    });
    return { applicationId: id, alreadySubmitted: false };
  }

  async ownerApplication(uid: string) {
    const result = await this.database.execute(
      `SELECT business_name, owner_name, status, admin_note, created_at
       FROM owner_applications WHERE auth_user_id = ? LIMIT 1`,
      [uid]
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }
}
