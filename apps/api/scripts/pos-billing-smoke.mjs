import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { applyMigrations } from './db-migrate.mjs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { PosService } = require('../dist/pos/pos.service.js');
const client = createClient({ url: 'file::memory:' });
const database = {
  execute: (sql, args = []) => client.execute({ sql, args }),
  async transaction(work) {
    const tx = await client.transaction('write');
    try { const result = await work(tx); await tx.commit(); return result; }
    catch (error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
  }
};
try {
  await applyMigrations(client, fileURLToPath(new URL('../migrations', import.meta.url)));
  await database.execute("INSERT INTO user_profiles(firebase_uid,email) VALUES ('owner','owner@example.test')");
  await database.execute("INSERT INTO organizations(id,name,slug,owner_user_id) VALUES ('org','Test','test','owner')");
  await database.execute("INSERT INTO organization_settings(organization_id) VALUES ('org')");
  const service = new PosService(database);
  for (const inclusive of [false, true]) {
    const id = await service.createProduct('org', 'owner', { name: 'Test', selling_price: inclusive ? 118 : 100, tax_rate: 18, tax_inclusive: inclusive, stock: 10 });
    const input = { items: [{ productId: id, quantity: 2 }], clientInvoiceId: randomUUID() };
    const bill = await service.createInvoice('org', 'owner', 'OWNER', input);
    assert.equal(bill.grand_total, 236);
    assert.deepEqual(await service.createInvoice('org', 'owner', 'OWNER', input), bill);
    const product = await service.product('org', id);
    assert.equal(Number(product.stock), 8);
    await assert.rejects(service.createInvoice('org', 'owner', 'STAFF', { ...input, clientInvoiceId: randomUUID(), discountValue: 20 }), /discount/);
    await assert.rejects(service.createInvoice('org', 'owner', 'OWNER', { items: [{ productId: id, quantity: 100 }] }), /stock/);
    const count = await database.execute('SELECT count(*) AS count FROM invoices WHERE organization_id = ?', ['org']);
    assert.equal(Number(count.rows[0].count), inclusive ? 2 : 1);
  }
  console.log('POS billing passed: inclusive/exclusive GST, retries, stock rollback and staff discount policy.');
} finally { client.close(); }
