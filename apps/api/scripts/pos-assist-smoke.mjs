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
  const atta = await pos.createProduct('org', 'owner', { name: 'आटा', sku: 'ATT', selling_price: 45, stock: 10 });
  const oil = await pos.createProduct('org', 'owner', { name: 'तेल', sku: 'TEL', selling_price: 120, stock: 10 });
  const flour = await pos.createProduct('org', 'owner', { name: 'Whole Wheat Flour', sku: 'FLOUR', selling_price: 55, stock: 10 });
  await pos.createProduct('org', 'owner', { name: 'Mustard Oil', sku: 'MUSTARD', selling_price: 130, stock: 10 });
  await pos.createProduct('org', 'owner', { name: 'Sunflower Oil', sku: 'SUNFLOWER', selling_price: 140, stock: 10 });
  await pos.createProduct('other', 'owner', { name: 'Private', selling_price: 99, stock: 10 });
  assert.deepEqual(await assist.draft('org', { mode: 'product', text: 'दूध ६० रुपये' }), { name: 'दूध', selling_price: 60, source: 'local' });
  assert.equal((await assist.draft('org', { mode: 'product', text: 'Milk @ 60.50' })).selling_price, 60.5);
  const draft = await assist.draft('org', { mode: 'bill', text: '0.5 Milk, MLK x 2' });
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].product.id, milk);
  assert.equal(draft.items[0].quantity, 2.5);
  const naturalDraft = await assist.draft('org', { mode: 'bill', text: 'Make a bill for two kilos of aata and one bottle of tel' });
  assert.deepEqual(naturalDraft.items.map(item => [item.product.id, item.quantity]).sort(), [[atta, 2], [oil, 1]].sort());
  const typoDraft = await assist.draft('org', { mode: 'bill', text: '2 kilo whole wheet flour' });
  assert.equal(typoDraft.items[0].product.id, flour);
  assert.equal(typoDraft.items[0].quantity, 2);
  assert.equal(Number((await pos.product('org', milk)).stock), 10, 'Draft must not consume stock');
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '6 Milk, 5 MLK' }), /stock/);
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 Private' }), /confidently match/);
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 Milk, 1 Missing' }), /confidently match/);
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 oil' }), error =>
    /Which product did you mean/.test(error.message) && error.message.includes('Mustard Oil') && error.message.includes('Sunflower Oil'));
  await assert.rejects(assist.draft('org', { mode: 'product', text: 'Milk' }), /name and price/);
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '-2 Milk' }), /quantities/);
  await pos.createProduct('org', 'owner', { name: 'Milk', sku: 'OTHER', selling_price: 65, stock: 10 });
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 Milk' }), /Which product/);
  assert.equal((await assist.draft('org', { mode: 'bill', text: '1 MLK' })).items[0].product.id, milk);
  process.env.AI_PROVIDER = 'openai-compatible';
  process.env.AI_PROVIDER_KEY = 'test-key';
  process.env.AI_PROVIDER_BASE_URL = 'https://assist.example.test/v1';
  process.env.AI_PROVIDER_MODEL = 'test-model';
  let cloudOutput = { items: [{ productId: milk, quantity: 1 }], unresolved: [] };
  let cloudCalls = 0;
  globalThis.fetch = async url => {
    assert.equal(url, 'https://assist.example.test/v1/chat/completions');
    cloudCalls += 1;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(cloudOutput) } }] }) };
  };
  const semanticDraft = await assist.draft('org', { mode: 'bill', text: '1 dairy' });
  assert.equal(semanticDraft.items[0].product.id, milk, 'Unmatched speech can use the configured AI catalog matcher');
  cloudOutput = { items: [], unresolved: ['oil could mean Mustard Oil or Sunflower Oil'] };
  await assert.rejects(assist.draft('org', { mode: 'bill', text: '1 oil' }), /Please clarify/);
  assert.equal(cloudCalls, 2);
  console.log('POS assist passed: key-free and AI drafts, Hindi/spoken quantities, typo/transliterated matching, ambiguity, stock, tenant isolation.');
} finally { client.close(); }
