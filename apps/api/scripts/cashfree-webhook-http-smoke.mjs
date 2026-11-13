import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
const require=createRequire(import.meta.url);
require('reflect-metadata');
const {NestFactory}=require('@nestjs/core');
const {Module}=require('@nestjs/common');
const {CashfreeWebhookController}=require('../dist/payments/payments.controller.js');
const {CashfreeService}=require('../dist/payments/cashfree.service.js');
const {CashfreeOrdersService}=require('../dist/payments/cashfree-orders.service.js');
process.env.CASHFREE_CLIENT_SECRET='isolated-test-secret';
let calls=0,fail=false;
class TestModule{}
Module({controllers:[CashfreeWebhookController],providers:[{provide:CashfreeService,useValue:new CashfreeService({})},{provide:CashfreeOrdersService,useValue:{webhook:async raw=>{calls++;assert.ok(Buffer.isBuffer(raw));if(fail)throw Error('retry');return {ignored:true};}}}]})(TestModule);
const app=await NestFactory.create(TestModule,{rawBody:true,logger:false});
app.setGlobalPrefix('api');app.useBodyParser('json',{limit:'4mb'});
await app.listen(0,'127.0.0.1');
try{
 const url=(await app.getUrl())+'/api/payments/cashfree/webhook';
 const body='{ "type": "PAYMENT_SUCCESS_WEBHOOK", "data": {"order":{"order_id":"test"}} }';
 const timestamp=String(Date.now());
 const signature=createHmac('sha256',process.env.CASHFREE_CLIENT_SECRET).update(timestamp+body).digest('base64');
 const send=(payload=body,sig=signature)=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-webhook-timestamp':timestamp,'x-webhook-signature':sig},body:payload});
 assert.equal((await send()).status,200);
 assert.equal((await send()).status,200);
 assert.equal((await send(body,'invalid')).status,400);
 assert.equal((await send(body+' ')).status,400);
 assert.equal(calls,2,'Invalid signatures must not reach processing');
 fail=true;assert.equal((await send()).status,500,'Processing failures must remain retryable');
 console.log('Webhook HTTP passed: signed raw JSON returns 200, duplicate delivery returns 200, invalid/tampered signatures rejected, processing failures retryable.');
}finally{await app.close();}
