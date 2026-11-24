import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {applyMigrations} from './db-migrate.mjs';
const require=createRequire(import.meta.url);
const {PosService}=require('../dist/pos/pos.service.js');
const client=createClient({url:'file::memory:'});
// Model serialized database writers while letting requests arrive concurrently.
// Reads outside the transaction remain unprotected, exposing stale-read regressions.
let queue=Promise.resolve();
const database={
  execute:(sql,args=[])=>client.execute({sql,args}),
  transaction(work){
    const result=queue.then(async()=>{
      const tx=await client.transaction('write');
      try {const value=await work(tx);await tx.commit();return value;}
      catch(error){await tx.rollback();throw error;}
      finally {tx.close();}
    });
    queue=result.catch(()=>{});
    return result;
  }
};
try {
  await applyMigrations(client,fileURLToPath(new URL('../migrations',import.meta.url)));
  for(const shop of ['a','b']){
    await database.execute('INSERT INTO user_profiles(firebase_uid,email) VALUES (?,?)',[shop,`${shop}@example.test`]);
    await database.execute('INSERT INTO organizations(id,name,slug,owner_user_id) VALUES (?,?,?,?)',[shop,shop,shop,shop]);
    await database.execute('INSERT INTO organization_settings(organization_id) VALUES (?)',[shop]);
  }
  const rawService=new PosService(database);
  const mutations=new Set(['issuePayment','adjustStock','cancelInvoice','issueCreditNote']);
  const service=new Proxy(rawService,{get(target,key){const fn=target[key];if(typeof fn!=='function')return fn;return (...args)=>{if(mutations.has(key))args[3]={operationId:randomUUID(),...args[3]};return fn.apply(target,args);};}});
  const product=await service.createProduct('a','a',{name:'Milk',selling_price:100,stock:20});
  const customer=await service.createCustomer('a','a',{name:'Customer'});
  const makeBill=(paid=0)=>service.createInvoice('a','a','OWNER',{customerId:customer,items:[{productId:product,quantity:1}],amountPaid:paid});
  const due=await makeBill();
  const payments=await Promise.allSettled([1,2].map(()=>service.issuePayment('a','a',due.invoice_id,{amount:100,method:'CASH'})));
  assert.equal(payments.filter(r=>r.status==='fulfilled').length,1,'Only one full collection may succeed');
  const detail=await service.invoiceDetail('a',due.invoice_id);
  assert.equal(detail.payments.length,1);
  assert.equal(Number(detail.invoice.amount_due),0);
  assert.equal(Number((await service.customer('a',customer)).outstanding_balance),0);
  const before=Number((await service.product('a',product)).stock);
  await Promise.all([3,4].map(quantityChange=>service.adjustStock('a','a',product,{quantityChange})));
  assert.equal(Number((await service.product('a',product)).stock),before+7);
  const unpaid=await makeBill();
  const beforeCancel=Number((await service.product('a',product)).stock);
  const cancels=await Promise.allSettled([1,2].map(()=>service.cancelInvoice('a','a',unpaid.invoice_id,{reason:'Duplicate sale'})));
  assert.equal(cancels.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(Number((await service.product('a',product)).stock),beforeCancel+1,'Cancellation restores stock once');
  const partial=await makeBill(50);
  const partialItems=await service.returnableInvoiceItems('a',partial.invoice_id);
  await assert.rejects(service.issueCreditNote('a','a',partial.invoice_id,{reason:'Return sale',refundMethod:'CASH',items:[{invoice_item_id:partialItems[0].id,quantity:1}]}),/fully paid/);
  const refundable=await makeBill(100);
  const items=await service.returnableInvoiceItems('a',refundable.invoice_id);
  const refunds=await Promise.allSettled([1,2].map(()=>service.issueCreditNote('a','a',refundable.invoice_id,{reason:'Return sale',refundMethod:'CASH',items:[{invoice_item_id:items[0].id,quantity:1}]})));
  assert.equal(refunds.filter(r=>r.status==='fulfilled').length,1);
  const refundDetail=await service.invoiceDetail('a',refundable.invoice_id);
  assert.equal(Number(refundDetail.invoice.credited_amount),100);
  for(const action of [()=>service.product('b',product),()=>service.customer('b',customer),()=>service.invoiceDetail('b',due.invoice_id),()=>service.issuePayment('b','b',partial.invoice_id,{amount:10,method:'CASH'}),()=>service.adjustStock('b','b',product,{quantityChange:1}),()=>service.cancelInvoice('b','b',partial.invoice_id,{reason:'Foreign bill'})]) await assert.rejects(action,/not found/i);
  assert.equal((await service.listProducts('b')).length,0);
  assert.equal((await service.listInvoices('b')).length,0);
  const retryBill=await makeBill();
  const paymentInput={operationId:randomUUID(),amount:20,method:'CASH'};
  const first=await service.issuePayment('a','a',retryBill.invoice_id,paymentInput);
  assert.deepEqual(await service.issuePayment('a','a',retryBill.invoice_id,paymentInput),first);
  await assert.rejects(service.issuePayment('a','a',retryBill.invoice_id,{...paymentInput,amount:30}),/different details/);
  const stockInput={operationId:randomUUID(),quantityChange:2};
  const stockBefore=Number((await service.product('a',product)).stock);
  await Promise.all([1,2].map(()=>service.adjustStock('a','a',product,stockInput)));
  assert.equal(Number((await service.product('a',product)).stock),stockBefore+2);
  await assert.rejects(rawService.adjustStock('a','a',product,{quantityChange:2}),/operationId/);
  const failedId=randomUUID();
  await assert.rejects(service.adjustStock('a','a',product,{operationId:failedId,quantityChange:-999}),/negative/);
  assert.equal((await database.execute('SELECT * FROM pos_operations WHERE operation_id = ?',[failedId])).rows.length,0);
  // Dedicated tenant: a January sale and February refunds must remain in their own periods.
  const taxProduct=await service.createProduct('b','b',{name:'Taxed',selling_price:100,tax_rate:18,stock:10});
  const buyer=await service.createCustomer('b','b',{name:'Buyer'});
  const sale=await service.createInvoice('b','b','OWNER',{customerId:buyer,items:[{productId:taxProduct,quantity:2}]});
  await database.execute("UPDATE invoices SET invoice_date='2026-01-10T10:00:00.000Z',created_at='2026-01-10T10:00:00.000Z' WHERE id=?",[sale.invoice_id]);
  await database.execute("UPDATE payments SET created_at='2026-01-10T10:00:00.000Z' WHERE invoice_id=?",[sale.invoice_id]);
  const taxItems=await service.returnableInvoiceItems('b',sale.invoice_id);
  const refundInput={operationId:randomUUID(),reason:'Partial return',refundMethod:'CASH',items:[{invoice_item_id:taxItems[0].id,quantity:1}]};
  const credit=await service.issueCreditNote('b','b',sale.invoice_id,refundInput);
  assert.equal(credit.total_amount,118);
  assert.deepEqual(await service.issueCreditNote('b','b',sale.invoice_id,refundInput),credit);
  await database.execute("UPDATE credit_notes SET created_at='2026-02-10T10:00:00.000Z' WHERE invoice_id=?",[sale.invoice_id]);
  await database.execute("UPDATE payments SET created_at='2026-02-10T10:00:00.000Z' WHERE invoice_id=? AND payment_kind='REFUND'",[sale.invoice_id]);
  const jan=await service.reportSummary('b','2026-01-01','2026-01-31T23:59:59.999Z');
  const feb=await service.reportSummary('b','2026-02-01','2026-02-28T23:59:59.999Z');
  assert.equal(jan.summary.sales,236);assert.equal(jan.summary.collected,236);
  assert.equal(feb.summary.sales,-118);assert.equal(feb.summary.collected,-118);
  assert.equal(feb.topProducts[0].quantity,-1);
  const gst=await service.gstReport('b','2026-01-01','2026-12-31');
  assert.equal(gst.summary.grossSales,118);assert.equal(gst.summary.totalTax,18);
  assert.equal(gst.rateBreakdown[0].gross,118);
  const ledger=await service.customerLedger('b',buyer);
  assert.equal(ledger.events[0].running_balance,0);
  const finalRefund={...refundInput,operationId:randomUUID()};
  await service.issueCreditNote('b','b',sale.invoice_id,finalRefund);
  assert.equal((await service.reportSummary('b','2026-01-01','2026-12-31')).summary.sales,0);
  assert.equal((await service.gstReport('b','2026-01-01','2026-12-31')).summary.totalTax,0);
  assert.equal((await service.customerLedger('b',buyer)).events[0].running_balance,0);
  console.log('Retry and refund reporting passed: replay, changed payload, rollback, period boundaries, tax, full/partial refunds and ledger.');
  console.log('POS mutations passed: concurrent full collection, stock increments, cancellation, refund, unpaid refund rejection and cross-tenant access. Serialized local writer model; not a remote load test.');
} finally {client.close();}
