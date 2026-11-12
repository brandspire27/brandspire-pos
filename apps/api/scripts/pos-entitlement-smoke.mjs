import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PosAuthGuard}=require('../dist/pos/pos-auth.guard.js');
let membership={organization_id:'shop',role:'OWNER'};
let subscription={status:'ACTIVE',ends_at:null};
const guard=new PosAuthGuard({verifyIdToken:async()=>({uid:'owner'})},{execute:async sql=>({rows:sql.includes('organization_members')?(membership?[membership]:[]):(subscription?[subscription]:[])})});
const request=method=>({method,headers:{authorization:'Bearer test-token'}});
const check=method=>guard.canActivate({switchToHttp:()=>({getRequest:()=>request(method)})});
for(const status of ['ACTIVE','TRIAL','GRACE_PERIOD']){subscription={status,ends_at:new Date(Date.now()+60000).toISOString()};assert.equal(await check('POST'),true);}
for(const value of [null,{status:'ACTIVE',ends_at:'invalid'},{status:'TRIAL',ends_at:'2000-01-01T00:00:00Z'},{status:'CANCELLED',ends_at:null}]){
  subscription=value;for(const method of ['POST','PUT','PATCH','DELETE'])await assert.rejects(check(method),/Subscription expired/);
  assert.equal(await check('GET'),true,'Historical records must remain readable');
}
membership=null;await assert.rejects(check('GET'),/membership/);
console.log('Entitlement checks passed: allowed states, expired/invalid dates, mutations blocked, historical reads and inactive membership.');
