import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { applyMigrations } from './db-migrate.mjs';
const require = createRequire(import.meta.url);
const { PosService } = require('../dist/pos/pos.service.js');
const { PosAssistService } = require('../dist/pos/pos-assist.service.js');
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
delete process.env.AI_PROVIDER_KEY;
// No cloud request is allowed in these tests.
globalThis.fetch = async () => { throw new Error('Unexpected cloud call'); };
try {
  await applyMigrations(client, fileURLToPath(new URL('../migrations', import.meta.url)));
  await database.execute("INSERT INTO user_profiles(firebase_uid,email) VALUES ('owner','owner@example.test')");
  for (const id of ['org', 'other']) await database.execute('INSERT INTO organizations(id,name,slug,owner_user_id) VALUES (?,?,?,?)', [id, id, id, 'owner']);
  const pos = new PosService(database);
  const assist = new PosAssistService(pos);
  const milk = await pos.createProduct('org', 'owner', { name: 'Milk', sku: 'MLK', selling_price: 60, stock: 10 });
  await pos.createProduct('other', 'owner', { name: 'Private', selling_price: 99, stock: 10 });
  assert.deepEqual(await assist.draft('org', { mode: 'product', text: 'दूध ६० रुपये' }), { name: 'दूध', selling_price: 60, source: 'local' });
  assert.equal((await assist.draft('org', { mode: 'product', text: 'Milk @ 60.50' })).selling_price, 60.5);
  const draft = await assist.draft('org', { mode: 'bill', text: '0.5 Milk, MLK x 2' });
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].product.id, milk);
  assert.equal(draft.items[0].quantity, 2.5);
  assert.equal(Number((await pos.product('org', milk)).stock), 10, 'Draft must not consume stock');
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '6 Milk, 5 MLK' }), /stock/);
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 Private' }), /unique/);
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 Milk, 1 Missing' }), /unique/);
  await assert.rejects(assist.draft('org', { mode: 'product', text: 'Milk' }), /name and price/);
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '-2 Milk' }), /quantities/);
  await pos.createProduct('org', 'owner', { name: 'Milk', sku: 'OTHER', selling_price: 65, stock: 10 });
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 Milk' }), /unique/);
  assert.equal((await assist.draft('org', { mode: 'bill', text: '1 MLK' })).items[0].product.id, milk);
  console.log('POS assist passed: key-free drafts, Hindi digits, fractional quantities, aggregate stock, tenant isolation, ambiguity, no stock mutation.');
} finally { client.close(); }
