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
  const productRequest={id:randomUUID(),name:'Retry product',selling_price:15,stock:7};
  const createdId=await service.createProduct('org','owner',productRequest);
  await database.execute('UPDATE products SET stock=6 WHERE id=?',[createdId]);
  assert.equal(await service.createProduct('org','owner',productRequest),createdId);
  assert.equal(Number((await service.product('org',createdId)).stock),6);
  const opening=await database.execute("SELECT count(*) AS count FROM inventory_movements WHERE product_id=? AND movement_type='OPENING'",[createdId]);
  assert.equal(Number(opening.rows[0].count),1);
  await assert.rejects(service.createProduct('org','owner',{...productRequest,stock:9}),/request ID/);
  await assert.rejects(service.createProduct('different-shop','owner',productRequest),/request ID/);
  const offlineProduct=await service.createProduct('org','owner',{name:'Offline test',selling_price:50,stock:5,tax_rate:0});
  const offlineId=randomUUID();
  await assert.rejects(service.createInvoice('org','owner','OWNER',{clientInvoiceId:offlineId,items:[{productId:offlineProduct,quantity:1,expectedPrice:40,expectedTax:0,expectedInclusive:false}]}),/Price or tax changed/);
  assert.equal(Number((await service.product('org',offlineProduct)).stock),5);
  const offlineInput={clientInvoiceId:offlineId,items:[{productId:offlineProduct,quantity:1,expectedPrice:50,expectedTax:0,expectedInclusive:false}]};
  const savedOffline=await service.createInvoice('org','owner','OWNER',offlineInput);
  await database.execute('UPDATE products SET selling_price=55 WHERE id=?',[offlineProduct]);
  assert.deepEqual(await service.createInvoice('org','owner','OWNER',offlineInput),savedOffline);
  assert.equal(Number((await service.product('org',offlineProduct)).stock),4);
  // A queued sale must not become an invoice/payment when current stock or policy rejects it.
  const beforeConflict=await database.execute('SELECT (SELECT count(*) FROM invoices) AS bills,(SELECT count(*) FROM payments) AS payments,(SELECT count(*) FROM inventory_movements) AS movements');
  const currentSnapshot={productId:offlineProduct,quantity:8,expectedPrice:55,expectedTax:0,expectedInclusive:false};
  await assert.rejects(service.createInvoice('org','owner','OWNER',{clientInvoiceId:randomUUID(),items:[currentSnapshot]}),/stock/);
  await assert.rejects(service.createInvoice('org','owner','OWNER',{clientInvoiceId:randomUUID(),items:[{...currentSnapshot,quantity:1,expectedTax:18}]}),/Price or tax changed/);
  await assert.rejects(service.createInvoice('org','owner','OWNER',{clientInvoiceId:randomUUID(),items:[{...currentSnapshot,quantity:1,expectedInclusive:true}]}),/Price or tax changed/);
  await assert.rejects(service.createInvoice('org','owner','STAFF',{clientInvoiceId:randomUUID(),items:[{...currentSnapshot,quantity:1}],discountValue:10}),/discount/);
  const afterConflict=await database.execute('SELECT (SELECT count(*) FROM invoices) AS bills,(SELECT count(*) FROM payments) AS payments,(SELECT count(*) FROM inventory_movements) AS movements');
  assert.deepEqual(afterConflict.rows,beforeConflict.rows);
  assert.equal(Number((await service.product('org',offlineProduct)).stock),4);
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
    assert.equal(Number(count.rows[0].count), inclusive ? 3 : 2);
  }
  console.log('POS billing passed: inclusive/exclusive GST, retries, stock rollback and staff discount policy.');
} finally { client.close(); }
