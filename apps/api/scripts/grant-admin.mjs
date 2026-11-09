import 'dotenv/config';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createClient } from '@libsql/client';
import { randomBytes } from 'node:crypto';

const email = process.argv[2]?.trim();
if (!email || !email.includes('@')) throw new Error('Usage: node scripts/grant-admin.mjs <existing-user-email>');
const projectId = process.env.FIREBASE_PROJECT_ID;
const account = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
const credential = account ? cert(JSON.parse(account)) : applicationDefault();
const app = initializeApp({ projectId, credential });
const user = await getAuth(app).getUserByEmail(email).catch(async error => {
  if (error.code !== 'auth/user-not-found' || !process.argv.includes('--create')) throw error;
  // Initial password is never displayed or stored. Account owner sets it through email recovery.
  return getAuth(app).createUser({ email, password: randomBytes(32).toString('base64url'), emailVerified: false });
});
if (user.disabled) throw new Error('Cannot grant admin access to a disabled Firebase account');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  const tx = await db.transaction('write');
  try {
    const profile = await tx.execute({ sql: 'SELECT disabled FROM user_profiles WHERE firebase_uid = ?', args: [user.uid] });
    if (Number(profile.rows[0]?.disabled ?? 0) === 1) throw new Error('Cannot grant admin access to a disabled profile');
    await tx.execute({
      sql: `INSERT INTO user_profiles(firebase_uid, email, display_name) VALUES (?, ?, ?)
            ON CONFLICT(firebase_uid) DO UPDATE SET email = excluded.email`,
      args: [user.uid, user.email, user.displayName ?? null]
    });
    await tx.execute({
      sql: `INSERT INTO platform_admins(user_id, display_name, active) VALUES (?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET active = 1`,
      args: [user.uid, user.displayName ?? null]
    });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
  const result = await db.execute({
    sql: `SELECT u.email FROM platform_admins a JOIN user_profiles u ON u.firebase_uid = a.user_id
          WHERE a.user_id = ? AND a.active = 1 AND u.disabled = 0`, args: [user.uid]
  });
  if (!result.rows.length) throw new Error('Admin grant verification failed');
  console.log(`Admin access enabled for ${result.rows[0].email}`);
} finally { db.close(); }
