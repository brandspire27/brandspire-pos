// Manual sandbox acceptance harness. Never uses the configured live database.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createClient} from '@libsql/client';
import {fileURLToPath} from 'node:url';
import {applyMigrations} from './db-migrate.mjs';
const require=createRequire(import.meta.url);
if(process.env.CASHFREE_ENV!=='sandbox' || !process.env.CASHFREE_CLIENT_ID?.startsWith('TEST')) throw Error('Sandbox test credentials required');
Object.assign(process.env,{APP_ENV:'development',TURSO_DATABASE_URL:'file::memory:',TURSO_AUTH_TOKEN:'isolated',WEB_URL:'http://localhost:3199',API_PUBLIC_URL:'http://localhost:3199'});
const {CashfreeOrdersService}=require('../dist/payments/cashfree-orders.service.js');
const {CashfreeService}=require('../dist/payments/cashfree.service.js');
const client=createClient({url:'file::memory:'});
const db={execute:(sql,args=[])=>client.execute({sql,args}),async transaction(work){const tx=await client.transaction('write');try{const result=await work(tx);await tx.commit();return result;}catch(e){await tx.rollback();throw e;}finally{tx.close();}}};
await applyMigrations(client,fileURLToPath(new URL('../migrations',import.meta.url)));
await db.execute("INSERT INTO user_profiles(firebase_uid,email) VALUES ('sandbox-owner','sandbox@example.com')");
await db.execute("INSERT INTO organizations(id,name,slug,owner_user_id,phone) VALUES ('sandbox-org','Sandbox Test','sandbox-test','sandbox-owner','9999999999')");
await db.execute("INSERT INTO plans(id,code,name,monthly_price,half_yearly_price,yearly_price) VALUES ('sandbox-plan','SANDBOX','Sandbox Basic',399,1799,3499)");
const cashfree=new CashfreeService(db);
const provider={isConfigured:()=>cashfree.isConfigured(),getEnvironment:()=>cashfree.getEnvironment(),request:(path,init)=>{
 // Local-only harness has no publicly reachable webhook. Verify using the real order API.
 if(init?.body){const body=JSON.parse(init.body);delete body.order_meta.notify_url;init={...init,body:JSON.stringify(body)};}
 return cashfree.request(path,init);
}};
const service=new CashfreeOrdersService(db,provider);
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.url==='/checkout'&&req.method==='POST'){
   const data=await service.checkout('sandbox-org','sandbox-owner','sandbox@example.com','sandbox-plan','MONTHLY');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
  }
  if(req.url.startsWith('/verify?')){
   const orderId=new URL(req.url,'http://localhost:3199').searchParams.get('order');
   const result=await service.verify('sandbox-org','sandbox-owner',orderId);
   const subscriptions=(await db.execute('SELECT status,ends_at,term_months FROM subscriptions')).rows;
   const transactions=(await db.execute('SELECT amount,status FROM payment_transactions')).rows;
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result,subscriptions,transactions}));return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><title>BrandSpire isolated sandbox test</title><script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script></head><body style="font-family:system-ui;padding:40px"><h1>BrandSpire sandbox — no real money</h1><p>Isolated test database. Production is unchanged.</p><button id="start">Start sandbox checkout ₹399</button> <button id="verify">Verify payment / retry</button><pre id="result"></pre><script>
let order=new URLSearchParams(location.search).get('cashfree_order_id')||sessionStorage.getItem('sandboxOrder');
const output=document.getElementById('result');
document.getElementById('start').onclick=async()=>{try{const r=await fetch('/checkout',{method:'POST'});const d=await r.json();if(!r.ok)throw Error(d.error);order=d.orderId;sessionStorage.setItem('sandboxOrder',order);await Cashfree({mode:'sandbox'}).checkout({paymentSessionId:d.paymentSessionId,redirectTarget:'_self'});}catch(e){output.textContent=e.message;}};
document.getElementById('verify').onclick=async()=>{if(!order){output.textContent='Start a checkout first';return;}const r=await fetch('/verify?order='+encodeURIComponent(order));output.textContent=JSON.stringify(await r.json(),null,2);};
</script></body></html>`);
 }catch(e){res.statusCode=502;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}
});
server.listen(3199,'127.0.0.1',()=>console.log('Sandbox harness: http://localhost:3199 — isolated DB, real sandbox provider'));
