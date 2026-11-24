import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FirebaseRequest } from '../common/firebase-auth.guard';
import { TursoService } from '../database/turso.service';
import { installationPackages } from '../payments/installation-packages';

const applicationSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/),
  businessType: z.string().trim().max(100).optional().default(''),
  gstin: z.string().trim().max(15).optional().default(''),
  state: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(500),
  preferredLanguage: z.enum(['en', 'hi', 'hinglish']),
  installationPackageCode: z.enum(['SCH_58MM', 'STANDARD_58MM', 'STANDARD_80MM', 'AUTO_CUTTER_80MM']),
  installationPaymentMethod: z.enum(['CASHFREE', 'CASH_ON_INSTALLATION']),
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
    const packageDetails = installationPackages[values.installationPackageCode];
    const existing = await this.database.execute(
      `SELECT id, status, installation_package_code, installation_payment_method
       FROM owner_applications WHERE auth_user_id = ? LIMIT 1`,
      [request.firebaseUid!]
    );
    if (existing.rows.length) {
      const current = existing.rows[0] as unknown as {
        id: string; status: string; installation_package_code: string | null; installation_payment_method: string | null;
      };
      if (current.status !== 'PENDING') throw new BadRequestException('This owner application has already been reviewed.');
      if (current.installation_package_code) {
        if (current.installation_package_code !== values.installationPackageCode ||
            current.installation_payment_method !== values.installationPaymentMethod) {
          throw new BadRequestException('This application already has a printer package and payment choice. Continue from your application status page.');
        }
        return { applicationId: current.id, alreadySubmitted: true };
      }
      await this.database.transaction(async tx => {
        await tx.execute({
          sql: `UPDATE owner_applications SET installation_package_code = ?, installation_amount = ?,
                installation_payment_method = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ? AND status = 'PENDING'`,
          args: [values.installationPackageCode, packageDetails.amount, values.installationPaymentMethod, current.id]
        });
        if (values.installationPaymentMethod === 'CASH_ON_INSTALLATION') {
          await tx.execute({
            sql: `INSERT INTO installation_checkout_sessions
                  (id, application_id, provider, amount, currency, status)
                  VALUES (?, ?, 'CASH_ON_INSTALLATION', ?, 'INR', 'DUE')`,
            args: [randomUUID(), current.id, packageDetails.amount]
          });
        }
      });
      return { applicationId: current.id, alreadySubmitted: true };
    }
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
          preferred_language, terms_version, terms_accepted_at, status, installation_package_code,
          installation_amount, installation_payment_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
        args: [id, request.firebaseUid!, request.firebaseEmail!, values.ownerName, values.businessName, values.phone,
          values.businessType || null, values.gstin.toUpperCase() || null, values.state, values.address,
          values.preferredLanguage, values.termsVersion, now, values.installationPackageCode, packageDetails.amount,
          values.installationPaymentMethod]
      });
      await tx.execute({
        sql: `INSERT INTO terms_acceptances(id, user_id, application_id, terms_version, accepted_at) VALUES (?, ?, ?, ?, ?)`,
        args: [randomUUID(), request.firebaseUid!, id, values.termsVersion, now]
      });
      if (values.installationPaymentMethod === 'CASH_ON_INSTALLATION') {
        await tx.execute({
          sql: `INSERT INTO installation_checkout_sessions
                (id, application_id, provider, amount, currency, status)
                VALUES (?, ?, 'CASH_ON_INSTALLATION', ?, 'INR', 'DUE')`,
          args: [randomUUID(), id, packageDetails.amount]
        });
      }
    });
    return { applicationId: id, alreadySubmitted: false };
  }

  async ownerApplication(uid: string) {
    const result = await this.database.execute(
      `SELECT a.business_name, a.owner_name, a.status, a.admin_note, a.created_at,
         a.installation_package_code, a.installation_amount, a.installation_payment_method,
         (SELECT s.status FROM installation_checkout_sessions s WHERE s.application_id = a.id ORDER BY s.created_at DESC LIMIT 1) AS installation_payment_status,
         (SELECT s.provider_order_id FROM installation_checkout_sessions s WHERE s.application_id = a.id ORDER BY s.created_at DESC LIMIT 1) AS installation_order_id,
         (SELECT s.paid_at FROM installation_checkout_sessions s WHERE s.application_id = a.id ORDER BY s.created_at DESC LIMIT 1) AS installation_paid_at,
         (SELECT s.collected_at FROM installation_checkout_sessions s WHERE s.application_id = a.id ORDER BY s.created_at DESC LIMIT 1) AS installation_collected_at
       FROM owner_applications a WHERE a.auth_user_id = ? LIMIT 1`,
      [uid]
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }
}
