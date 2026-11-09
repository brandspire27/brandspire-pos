import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';

export async function applyMigrations(client, directory) {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const files = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(directory, file), 'utf8');
    const version = file.replace(/\.sql$/i, '');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const transaction = await client.transaction('write');
    try {
      const applied = await transaction.execute({
        sql: 'SELECT checksum FROM schema_migrations WHERE version = ?',
        args: [version]
      });
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${version} has changed; create a new migration instead`);
        }
        await transaction.commit();
        console.log(`SKIP ${version}`);
        continue;
      }

      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await transaction.execute(statement);
      }
      await transaction.execute({
        sql: 'INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)',
        args: [version, checksum]
      });
      await transaction.commit();
      console.log(`APPLIED ${version}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  const url = (process.env.TURSO_DATABASE_URL ?? '').trim();
  const authToken = (process.env.TURSO_AUTH_TOKEN ?? '').trim();
  if (!url || (!url.startsWith('file:') && !authToken)) {
    throw new Error('Set TURSO_DATABASE_URL and, for remote databases, TURSO_AUTH_TOKEN');
  }
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
  try {
    await applyMigrations(client, directory);
  } finally {
    client.close();
  }
}
