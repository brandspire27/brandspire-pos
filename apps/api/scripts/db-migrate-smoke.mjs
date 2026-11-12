import assert from 'node:assert/strict';
import path from 'node:path';
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
    await applyMigrations(client, migrationsDirectory);
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(migrationLogs, [
    'APPLIED 0001_turso_schema',
    'APPLIED 0002_billing_auth_fields',
    'APPLIED 0003_product_create_requests',
    'SKIP 0001_turso_schema',
    'SKIP 0002_billing_auth_fields',
    'SKIP 0003_product_create_requests'
  ]);

  const migrationCount = await client.execute('SELECT count(*) AS count FROM schema_migrations');
  assert.equal(Number(migrationCount.rows[0].count), 3);
  const tables = await client.execute(
    "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  assert.equal(Number(tables.rows[0].count), 32);

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
