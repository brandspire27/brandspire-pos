import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { applyMigrations } from './db-migrate.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.resolve(scriptsDirectory, '..');
const migrationsDirectory = path.join(apiDirectory, 'migrations');

const client = createClient({ url: 'file::memory:' });
try {
  const migrationLogs = [];
  const originalLog = console.log;
  try {
    console.log = (message) => migrationLogs.push(message);
    await applyMigrations(client, migrationsDirectory);
    const initialMigration = await readFile(path.join(migrationsDirectory, '0001_turso_schema.sql'), 'utf8');
    const legacyWindowsChecksum = createHash('sha256')
      .update(initialMigration.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'))
      .digest('hex');
    await client.execute({
      sql: 'UPDATE schema_migrations SET checksum = ? WHERE version = ?',
      args: [legacyWindowsChecksum, '0001_turso_schema']
    });
    await applyMigrations(client, migrationsDirectory);
  } finally {
    console.log = originalLog;
  }
  const versions = (await readdir(migrationsDirectory))
    .filter(name => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort()
    .map(name => name.replace(/\.sql$/i, ''));
  assert.ok(versions.length >= 9, 'Installation checkout migration must be present');
  assert.deepEqual(migrationLogs, [
    ...versions.map(version => `APPLIED ${version}`),
    ...versions.map(version => `SKIP ${version}`)
  ]);

  const migrationCount = await client.execute('SELECT count(*) AS count FROM schema_migrations');
  assert.equal(Number(migrationCount.rows[0].count), versions.length);
  const checkoutColumns = await client.execute('PRAGMA table_info(subscription_checkout_sessions)');
  for (const name of ['provider_order_id', 'term_months', 'request_payload', 'last_reconciled_at']) {
    assert.ok(checkoutColumns.rows.some(row => row.name === name), `Missing checkout column ${name}`);
  }
  const tables = await client.execute(
    "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  assert.equal(Number(tables.rows[0].count), 34);
  const installationColumns = await client.execute('PRAGMA table_info(owner_applications)');
  for (const name of ['installation_package_code', 'installation_amount', 'installation_payment_method']) {
    assert.ok(installationColumns.rows.some(row => row.name === name), `Missing owner application column ${name}`);
  }

  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute({
    sql: 'INSERT INTO user_profiles (firebase_uid, email) VALUES (?, ?), (?, ?)',
    args: ['owner-a', 'owner-a@example.test', 'owner-b', 'owner-b@example.test']
  });
  await client.execute({
    sql: 'INSERT INTO organizations (id, name, slug, owner_user_id) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
    args: ['org-a', 'A', 'a', 'owner-a', 'org-b', 'B', 'b', 'owner-b']
  });
  await client.execute(
    'INSERT INTO categories (id, organization_id, name) VALUES (?, ?, ?)',
    ['category-b', 'org-b', 'B category']
  );

  await assert.rejects(client.execute({
    sql: 'INSERT INTO products (id, organization_id, category_id, name, selling_price) VALUES (?, ?, ?, ?, ?)',
    args: ['product-a', 'org-a', 'category-b', 'Cross-tenant product', 1]
  }));
  const foreignKeyCheck = await client.execute('PRAGMA foreign_key_check');
  assert.equal(foreignKeyCheck.rows.length, 0);
  console.log('Turso migration smoke test passed (repeatability, schema, and tenant foreign keys).');
} finally {
  client.close();
}
